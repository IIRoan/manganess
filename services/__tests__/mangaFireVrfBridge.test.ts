import { act } from '@testing-library/react-native';
import {
  appendVrfParams,
  buildVrfScript,
  logVrfFailure,
  mangaFireVrfBridge,
  MANGA_FIRE_VRF_CHALLENGE_WAIT_MS,
  resetMangaFireVrfBridgeForTests,
  setMangaFireVrfBridgeProductionModeForTests,
  shouldProxyMangaFireApi,
  VRF_PROTECTION_HELPERS_JS,
} from '@/services/mangaFireVrfBridge';

jest.mock('@/utils/logger', () => ({
  logger: () => ({
    warn: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  }),
}));

const flushPromises = () => new Promise((resolve) => setImmediate(resolve));

function extractRequestId(script: string): string | null {
  const match = script.match(/var requestId = ("[^"]+"|'[^']+');/);
  if (!match?.[1]) {
    return null;
  }
  return JSON.parse(match[1]);
}

describe('mangaFireVrfBridge', () => {
  beforeEach(() => {
    resetMangaFireVrfBridgeForTests({ useTestToken: true });
  });

  afterEach(() => {
    resetMangaFireVrfBridgeForTests({ useTestToken: true });
  });

  it('skips vrf for top-titles endpoints', async () => {
    await expect(
      appendVrfParams('/top-titles', { type: 'trending', limit: 5 })
    ).resolves.toEqual({ type: 'trending', limit: 5 });
  });

  it('returns a test vrf token for protected endpoints in Jest', async () => {
    await expect(
      appendVrfParams('/titles/ro8ro')
    ).resolves.toEqual({ vrf: 'test-vrf-token' });
  });

  it('builds the readiness probe script with capability-based discovery', () => {
    const script = buildVrfScript();
    expect(script).toContain('notifyReady');
    expect(script).toContain('findProtectionModule');
    expect(script).toContain('collectProtectionCandidates');
    expect(script).toContain('scoreProtectionCandidate');
    expect(script).toContain('getProtectionToken');
    expect(script).toContain('MutationObserver');
    // Must not hard-code a single MangaFire build hash — those rename often.
    expect(script).not.toContain('vmz_b5512e');
    expect(script).not.toContain('vmO_6faacd');
  });

  it('includes helpers that discover modules by capability, not name', () => {
    expect(VRF_PROTECTION_HELPERS_JS).toContain('collectProtectionCandidates');
    expect(VRF_PROTECTION_HELPERS_JS).toContain('Object.getOwnPropertyNames');
    expect(VRF_PROTECTION_HELPERS_JS).toContain('extendClient');
    expect(VRF_PROTECTION_HELPERS_JS).toContain('fetchProtectedJson');
    expect(VRF_PROTECTION_HELPERS_JS).toContain('credentials');
    expect(VRF_PROTECTION_HELPERS_JS).toContain('appendCanonicalParams');
    // No fixed module-name regex — discovery is shape/behavior based.
    expect(VRF_PROTECTION_HELPERS_JS).not.toContain('/^vm[OoZz]_/');
  });

  it('reports Cloudflare challenge pages from the host probe', () => {
    const script = buildVrfScript();
    expect(script).toContain('looksLikeChallenge');
    expect(script).toContain("type: 'challenge'");
    expect(script).toContain("type: 'probe'");
  });

  it('logs vrf acquisition failures', () => {
    expect(() => logVrfFailure('/titles/ro8ro', new Error('boom'))).not.toThrow();
  });

  it('ignores invalid host messages', () => {
    mangaFireVrfBridge.handleMessage('not-json');
    mangaFireVrfBridge.handleMessage(JSON.stringify({ type: 'unknown' }));
    mangaFireVrfBridge.handleMessage(
      JSON.stringify({ type: 'vrf', id: 'missing', vrf: 'token' })
    );
  });

  it('marks the bridge ready from host messages', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    const injectedScripts: string[] = [];
    mangaFireVrfBridge.attachHost((script) => {
      injectedScripts.push(script);
    });
    mangaFireVrfBridge.handleMessage(JSON.stringify({ type: 'ready' }));

    const vrfPromise = appendVrfParams('/titles/example', { page: 1 });
    await flushPromises();

    expect(injectedScripts).toHaveLength(1);
    const requestId = extractRequestId(injectedScripts[0] ?? '');
    expect(requestId).toBeTruthy();

    mangaFireVrfBridge.handleMessage(
      JSON.stringify({
        type: 'vrf',
        id: requestId,
        vrf: 'generated-token',
      })
    );

    await expect(vrfPromise).resolves.toEqual({
      page: 1,
      vrf: 'generated-token',
    });
  });

  it('injects dynamic protection helpers when requesting a vrf token', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    const injectedScripts: string[] = [];
    mangaFireVrfBridge.attachHost((script) => {
      injectedScripts.push(script);
    });
    mangaFireVrfBridge.markReady();

    const vrfPromise = appendVrfParams('/titles/example');
    await flushPromises();

    expect(injectedScripts[0]).toContain('findProtectionModule');
    expect(injectedScripts[0]).toContain('generateProtectionToken');
    expect(injectedScripts[0]).not.toContain('window.vmz_b5512e');

    const requestId = extractRequestId(injectedScripts[0] ?? '');
    mangaFireVrfBridge.handleMessage(
      JSON.stringify({
        type: 'vrf',
        id: requestId,
        vrf: 'dynamic-token',
      })
    );

    await expect(vrfPromise).resolves.toEqual({ vrf: 'dynamic-token' });
  });

  it('rejects pending vrf requests when the host reports an error', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    const injectedScripts: string[] = [];
    mangaFireVrfBridge.attachHost((script) => {
      injectedScripts.push(script);
    });
    mangaFireVrfBridge.markReady();

    const vrfPromise = appendVrfParams('/titles/example');
    await flushPromises();

    const requestId = extractRequestId(injectedScripts[0] ?? '');
    mangaFireVrfBridge.handleMessage(
      JSON.stringify({
        type: 'vrf',
        id: requestId,
        error: 'Protection module not loaded',
      })
    );

    await expect(vrfPromise).rejects.toThrow('Protection module not loaded');
  });

  it('rejects pending requests when the host detaches', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    mangaFireVrfBridge.attachHost(() => { });
    mangaFireVrfBridge.markReady();

    const vrfPromise = appendVrfParams('/titles/example');
    await flushPromises();
    mangaFireVrfBridge.detachHost();

    await expect(vrfPromise).rejects.toThrow('MangaFire VRF host detached');
  });

  it('rejects when the host is unavailable', async () => {
    setMangaFireVrfBridgeProductionModeForTests();

    await expect(appendVrfParams('/titles/example')).rejects.toThrow(
      'MangaFire VRF host is not available'
    );
  });

  it('rejects vrf responses without a token value', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    const injectedScripts: string[] = [];
    mangaFireVrfBridge.attachHost((script) => {
      injectedScripts.push(script);
    });
    mangaFireVrfBridge.markReady();

    const vrfPromise = appendVrfParams('/titles/example');
    await flushPromises();

    const requestId = extractRequestId(injectedScripts[0] ?? '');
    mangaFireVrfBridge.handleMessage(
      JSON.stringify({
        type: 'vrf',
        id: requestId,
        vrf: null,
      })
    );

    await expect(vrfPromise).rejects.toThrow(
      'Failed to generate MangaFire VRF token'
    );
  });

  it('rejects when script injection fails', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    mangaFireVrfBridge.attachHost(() => {
      throw new Error('inject failed');
    });
    mangaFireVrfBridge.markReady();

    await expect(appendVrfParams('/titles/example')).rejects.toThrow(
      'inject failed'
    );
  });

  it('rejects when the injection handle is unavailable at request time', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    mangaFireVrfBridge.attachHost(() => { });
    mangaFireVrfBridge.markReady();
    (
      mangaFireVrfBridge as unknown as {
        webViewInject: ((script: string) => void) | null;
      }
    ).webViewInject = null;

    await expect(appendVrfParams('/titles/example')).rejects.toThrow(
      'MangaFire VRF host is not available'
    );
  });

  it('reloads the host webview if the protection module stays unready', async () => {
    jest.useFakeTimers();
    setMangaFireVrfBridgeProductionModeForTests();
    const reload = jest.fn();
    mangaFireVrfBridge.attachHost(() => { }, { reload });

    const vrfPromise = appendVrfParams('/titles/example');
    await act(async () => {
      jest.advanceTimersByTime(10000);
    });

    expect(reload).toHaveBeenCalled();
    mangaFireVrfBridge.detachHost();
    await expect(vrfPromise).rejects.toThrow('MangaFire VRF host detached');
    jest.useRealTimers();
  });

  it('includes challenge state in the ready timeout', async () => {
    jest.useFakeTimers();
    setMangaFireVrfBridgeProductionModeForTests();
    mangaFireVrfBridge.attachHost(() => { });

    const vrfPromise = appendVrfParams('/titles/example');
    await act(async () => {
      await Promise.resolve();
    });
    mangaFireVrfBridge.handleMessage(
      JSON.stringify({ type: 'challenge', title: 'Just a moment...' })
    );

    const timedOutEarly = jest.fn();
    vrfPromise.catch(timedOutEarly);

    await act(async () => {
      jest.advanceTimersByTime(20000);
    });
    expect(timedOutEarly).not.toHaveBeenCalled();

    const expectation = expect(vrfPromise).rejects.toThrow(
      'Cloudflare challenge still active'
    );

    await act(async () => {
      jest.advanceTimersByTime(MANGA_FIRE_VRF_CHALLENGE_WAIT_MS);
    });

    await expectation;
    jest.useRealTimers();
  });

  it('reopens the security overlay when a challenge arrives after ready', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    const injectedScripts: string[] = [];
    mangaFireVrfBridge.attachHost((script) => {
      injectedScripts.push(script);
    });
    const listener = jest.fn();
    mangaFireVrfBridge.subscribeHostUi(listener);

    mangaFireVrfBridge.handleMessage(JSON.stringify({ type: 'ready' }));
    expect(listener).toHaveBeenCalledWith({
      challengeVisible: false,
      ready: true,
    });

    listener.mockClear();
    mangaFireVrfBridge.handleMessage(
      JSON.stringify({ type: 'challenge', title: 'Just a moment...' })
    );

    expect(listener).toHaveBeenCalledWith({
      challengeVisible: true,
      ready: false,
    });

    const vrfPromise = appendVrfParams('/titles/example');
    await flushPromises();
    expect(injectedScripts).toHaveLength(0);

    mangaFireVrfBridge.handleMessage(JSON.stringify({ type: 'ready' }));
    await flushPromises();

    expect(injectedScripts).toHaveLength(1);
    const requestId = extractRequestId(injectedScripts[0] ?? '');
    mangaFireVrfBridge.handleMessage(
      JSON.stringify({
        type: 'vrf',
        id: requestId,
        vrf: 'after-challenge-token',
      })
    );

    await expect(vrfPromise).resolves.toEqual({
      vrf: 'after-challenge-token',
    });
  });

  it('notifies UI listeners when a Cloudflare challenge appears', () => {
    const listener = jest.fn();
    const unsubscribe = mangaFireVrfBridge.subscribeHostUi(listener);
    listener.mockClear();

    mangaFireVrfBridge.handleMessage(
      JSON.stringify({ type: 'challenge', title: 'Just a moment...' })
    );

    expect(listener).toHaveBeenCalledWith({
      challengeVisible: true,
      ready: false,
    });

    mangaFireVrfBridge.dismissChallenge();
    expect(listener).toHaveBeenCalledWith({
      challengeVisible: false,
      ready: false,
    });
    unsubscribe();
  });

  it('rejects in-flight waiters when the security check is dismissed', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    mangaFireVrfBridge.attachHost(() => { });

    const vrfPromise = appendVrfParams('/titles/example');
    await flushPromises();

    mangaFireVrfBridge.handleMessage(
      JSON.stringify({ type: 'challenge', title: 'Just a moment...' })
    );
    mangaFireVrfBridge.dismissChallenge();

    await expect(vrfPromise).rejects.toThrow(
      'Cloudflare verification dismissed'
    );
  });

  it('re-shows the security check and keeps the challenge timeout after dismiss', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    mangaFireVrfBridge.attachHost(() => { });
    const listener = jest.fn();
    mangaFireVrfBridge.subscribeHostUi(listener);

    const firstLoad = appendVrfParams('/titles/example');
    await flushPromises();
    mangaFireVrfBridge.handleMessage(
      JSON.stringify({ type: 'challenge', title: 'Just a moment...' })
    );
    mangaFireVrfBridge.dismissChallenge();
    await expect(firstLoad).rejects.toThrow(
      'Cloudflare verification dismissed'
    );

    listener.mockClear();
    jest.useFakeTimers();
    const secondLoad = appendVrfParams('/titles/example');
    await act(async () => {
      await Promise.resolve();
    });

    expect(listener).toHaveBeenCalledWith({
      challengeVisible: true,
      ready: false,
    });

    const timedOutEarly = jest.fn();
    secondLoad.catch(timedOutEarly);

    await act(async () => {
      jest.advanceTimersByTime(20000);
    });
    expect(timedOutEarly).not.toHaveBeenCalled();

    mangaFireVrfBridge.detachHost();
    await expect(secondLoad).rejects.toThrow('MangaFire VRF host detached');
    jest.useRealTimers();
  });

  it('times out when the protection module never becomes ready', async () => {
    jest.useFakeTimers();
    setMangaFireVrfBridgeProductionModeForTests();
    mangaFireVrfBridge.attachHost(() => { });

    const vrfPromise = appendVrfParams('/titles/example');
    const expectation = expect(vrfPromise).rejects.toThrow(
      'Timed out waiting for MangaFire protection module'
    );

    await act(async () => {
      jest.advanceTimersByTime(20000);
    });

    await expectation;
    jest.useRealTimers();
  });

  it('resolves vrf requests after the protection module becomes ready', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    const injectedScripts: string[] = [];
    mangaFireVrfBridge.attachHost((script) => {
      injectedScripts.push(script);
    });

    const vrfPromise = appendVrfParams('/titles/example', { page: 1 });
    await flushPromises();

    mangaFireVrfBridge.markReady();
    await flushPromises();

    const requestId = extractRequestId(injectedScripts[0] ?? '');
    mangaFireVrfBridge.handleMessage(
      JSON.stringify({
        type: 'vrf',
        id: requestId,
        vrf: 'delayed-ready-token',
      })
    );

    await expect(vrfPromise).resolves.toEqual({
      page: 1,
      vrf: 'delayed-ready-token',
    });
  });

  it('rejects ready waiters when the host detaches before becoming ready', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    mangaFireVrfBridge.attachHost(() => { });

    const vrfPromise = appendVrfParams('/titles/example');
    await flushPromises();
    mangaFireVrfBridge.detachHost();

    await expect(vrfPromise).rejects.toThrow('MangaFire VRF host detached');
  });

  it('times out when vrf generation never responds', async () => {
    jest.useFakeTimers();
    setMangaFireVrfBridgeProductionModeForTests();
    mangaFireVrfBridge.attachHost(() => { });
    mangaFireVrfBridge.markReady();

    const vrfPromise = appendVrfParams('/titles/example');
    const expectation = expect(vrfPromise).rejects.toThrow(
      'Timed out waiting for MangaFire VRF token'
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(20000);
    });

    await expectation;
    jest.useRealTimers();
  });

  it('does not proxy API fetches while using the test VRF token', () => {
    expect(shouldProxyMangaFireApi()).toBe(false);
  });

  it('proxies JSON API fetches through the host in production mode', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    expect(shouldProxyMangaFireApi()).toBe(true);

    const injectedScripts: string[] = [];
    mangaFireVrfBridge.attachHost((script) => {
      injectedScripts.push(script);
    });
    mangaFireVrfBridge.markReady();

    const fetchPromise = mangaFireVrfBridge.fetchJson<{ items: string[] }>(
      '/titles',
      { keyword: 'Test', limit: 40 }
    );
    await flushPromises();

    expect(injectedScripts[0]).toContain('fetchProtectedJson');
    expect(injectedScripts[0]).toContain('/titles');

    const requestId = extractRequestId(injectedScripts[0] ?? '');
    mangaFireVrfBridge.handleMessage(
      JSON.stringify({
        type: 'api',
        id: requestId,
        status: 200,
        data: { items: ['ok'] },
      })
    );

    await expect(fetchPromise).resolves.toEqual({
      status: 200,
      data: { items: ['ok'] },
    });
  });

  it('retries a proxied fetch after the Cloudflare challenge is solved', async () => {
    setMangaFireVrfBridgeProductionModeForTests();
    const injectedScripts: string[] = [];
    const reload = jest.fn();
    const listener = jest.fn();
    mangaFireVrfBridge.attachHost((script) => {
      injectedScripts.push(script);
    }, { reload });
    mangaFireVrfBridge.subscribeHostUi(listener);
    mangaFireVrfBridge.markReady();
    listener.mockClear();

    const fetchPromise = mangaFireVrfBridge.fetchJson<{ ok: boolean }>(
      '/titles/x11xq'
    );
    await flushPromises();

    const firstId = extractRequestId(injectedScripts[0] ?? '');
    mangaFireVrfBridge.handleMessage(
      JSON.stringify({
        type: 'api',
        id: firstId,
        status: 403,
        data: '<html><title>Just a moment...</title></html>',
      })
    );
    await flushPromises();

    expect(reload).toHaveBeenCalled();
    expect(listener).toHaveBeenCalledWith({
      challengeVisible: true,
      ready: false,
    });

    mangaFireVrfBridge.handleMessage(JSON.stringify({ type: 'ready' }));
    await flushPromises();

    const secondId = extractRequestId(injectedScripts[1] ?? '');
    expect(secondId).toBeTruthy();
    mangaFireVrfBridge.handleMessage(
      JSON.stringify({
        type: 'api',
        id: secondId,
        status: 200,
        data: { ok: true },
      })
    );

    await expect(fetchPromise).resolves.toEqual({
      status: 200,
      data: { ok: true },
    });
  });
});
