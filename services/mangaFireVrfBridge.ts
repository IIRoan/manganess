import { reportWait } from '@/services/telemetryService';
import { logger } from '@/utils/logger';

export interface VrfRequest {
  path: string;
  params?: Record<string, unknown>;
}

interface PendingVrfRequest extends VrfRequest {
  id: string;
  resolve: (vrf: string) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
}

interface PendingApiRequest {
  id: string;
  path: string;
  resolve: (result: { status: number; data: unknown }) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
  validateStatus: (status: number) => boolean;
}

type VrfHostMessage =
  | { type: 'ready'; discovery?: string }
  | { type: 'challenge'; title?: string }
  | { type: 'probe'; title?: string; snippet?: string }
  | { type: 'vrf'; id: string; vrf?: string | null; error?: string }
  | {
    type: 'api';
    id: string;
    status?: number;
    data?: unknown;
    error?: string;
    vrfAttached?: boolean;
    vrfLength?: number;
    protected?: boolean;
  };

export interface MangaFireVrfHostHandles {
  reload?: () => void;
}

export interface MangaFireVrfHostEvent {
  type: 'loadEnd' | 'httpError' | 'terminated' | 'error';
  url?: string;
  title?: string;
  statusCode?: number;
  description?: string;
}

export interface MangaFireHostFetchOptions {
  validateStatus?: (status: number) => boolean;
}

const REQUEST_TIMEOUT_MS = 20000;
const HOST_RELOAD_AFTER_MS = 10000;
export const MANGA_FIRE_VRF_CHALLENGE_WAIT_MS = 180000;

export interface MangaFireVrfHostUiState {
  challengeVisible: boolean;
  ready: boolean;
}
let useTestVrfToken =
  process.env.NODE_ENV === 'test' || typeof jest !== 'undefined';

export function resetMangaFireVrfBridgeForTests(options?: {
  useTestToken?: boolean;
}) {
  mangaFireVrfBridge.detachHost();
  useTestVrfToken =
    options?.useTestToken ??
    (process.env.NODE_ENV === 'test' || typeof jest !== 'undefined');
}

export function setMangaFireVrfBridgeProductionModeForTests() {
  useTestVrfToken = false;
}

export function shouldProxyMangaFireApi(): boolean {
  return !useTestVrfToken;
}

function createHttpError(
  status: number,
  data: unknown,
  message?: string
): Error & { response: { status: number; data: unknown } } {
  const error = new Error(
    message || `Request failed with status code ${status}`
  ) as Error & { response: { status: number; data: unknown } };
  error.response = { status, data };
  return error;
}

function isCloudflareChallenge(data: unknown): boolean {
  if (typeof data !== 'string') {
    return false;
  }
  return (
    data.includes('Just a moment') ||
    data.includes('cf-mitigated') ||
    data.includes('cf-browser-verification') ||
    data.includes('challenge-platform')
  );
}

function isCloudflareChallengeError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const message = String((error as { message?: string }).message ?? '');
  return message.includes('Cloudflare verification detected');
}

/**
 * Capability-based MangaFire protection discovery.
 *
 * Does NOT hard-code module names (those rotate: vmz_*, vmO_*, …).
 * Instead it:
 *  1. Prefers known stable globals (getProtectionToken / extendClient)
 *  2. Scans every own enumerable window value for a protection-shaped object
 *  3. Scores candidates by method signatures (extendClient, getProtectionToken,
 *     shouldProtect, canonicalQuery, …)
 *  4. Behavior-probes extendClient: wires a mock axios and checks whether the
 *     interceptor injects a long string param (vrf/token/or any new name)
 *  5. Continuously re-scans until ready (modules often load after DOMContentLoaded)
 */
export const VRF_PROTECTION_HELPERS_JS = `
  var PROTECTION_METHOD_HINTS = [
    'getProtectionToken',
    'extendClient',
    'shouldProtect',
    'canonicalQuery',
    'relativePath',
    'isTrustedEnvironment',
    'createStorage',
    'dynamicEncrypt',
    'PROTECTED_PATTERNS'
  ];

  var AUTH_PARAM_HINTS = ['vrf', 'token', 't', 'sig', 'sign', 'auth', 'key'];

  // Title endpoints mint ~15-char tokens; chapters are longer. 16+ rejected
  // valid One Piece /titles/{id} tokens and produced 403 Missing token.
  var MIN_AUTH_TOKEN_LENGTH = 12;

  function looksLikeAuthToken(value) {
    return typeof value === 'string' && value.length >= MIN_AUTH_TOKEN_LENGTH;
  }

  function extractAuthToken(params, baseline) {
    if (!params || typeof params !== 'object') return null;
    baseline = baseline || {};
    var preferred = AUTH_PARAM_HINTS;
    var i, key, value;

    for (i = 0; i < preferred.length; i++) {
      key = preferred[i];
      value = params[key];
      if (looksLikeAuthToken(value) && baseline[key] !== value) {
        return value;
      }
    }

    for (key in params) {
      if (!Object.prototype.hasOwnProperty.call(params, key)) continue;
      if (Object.prototype.hasOwnProperty.call(baseline, key) && baseline[key] === params[key]) {
        continue;
      }
      value = params[key];
      if (looksLikeAuthToken(value)) {
        return value;
      }
    }
    return null;
  }

  function extractTokenFromResult(result) {
    if (looksLikeAuthToken(result)) return result;
    if (!result || typeof result !== 'object') return null;
    if (looksLikeAuthToken(result.vrf)) return result.vrf;
    if (looksLikeAuthToken(result.token)) return result.token;
    if (result.params) return extractAuthToken(result.params, {});
    return null;
  }

  function scoreProtectionCandidate(candidate) {
    if (!candidate || (typeof candidate !== 'object' && typeof candidate !== 'function')) {
      return 0;
    }
    var score = 0;
    for (var i = 0; i < PROTECTION_METHOD_HINTS.length; i++) {
      var name = PROTECTION_METHOD_HINTS[i];
      var value = candidate[name];
      if (typeof value === 'function') score += 3;
      else if (value != null) score += 1;
    }
    if (typeof candidate.extendClient === 'function') score += 4;
    if (typeof candidate.getProtectionToken === 'function') score += 5;
    return score;
  }

  function collectProtectionCandidates() {
    var seen = [];
    var results = [];

    function consider(candidate, source) {
      if (!candidate) return;
      if (seen.indexOf(candidate) !== -1) return;
      seen.push(candidate);
      var score = scoreProtectionCandidate(candidate);
      if (score < 3) return;
      results.push({ candidate: candidate, source: source, score: score });
    }

    consider(window, 'window');

    var keys;
    try {
      keys = Object.getOwnPropertyNames(window);
    } catch (e) {
      keys = Object.keys(window);
    }

    for (var i = 0; i < keys.length; i++) {
      var key = keys[i];
      var value;
      try {
        value = window[key];
      } catch (err) {
        continue;
      }
      consider(value, key);
      if (value && typeof value === 'object') {
        try {
          if (typeof value.extendClient === 'function' || typeof value.getProtectionToken === 'function') {
            consider(value, key);
          }
        } catch (ignore) {}
      }
    }

    results.sort(function(a, b) { return b.score - a.score; });
    return results;
  }

  function findProtectionModule() {
    if (window.__manganessProtectionModule) {
      return window.__manganessProtectionModule;
    }

    var ranked = collectProtectionCandidates();
    if (!ranked.length) return null;

    // Prefer highest score; window itself only if it actually has the APIs.
    for (var i = 0; i < ranked.length; i++) {
      var entry = ranked[i];
      if (
        typeof entry.candidate.getProtectionToken === 'function' ||
        typeof entry.candidate.extendClient === 'function'
      ) {
        window.__manganessProtectionModule = entry.candidate;
        window.__manganessProtectionSource = entry.source;
        return entry.candidate;
      }
    }
    return null;
  }

  function clearProtectionCache() {
    window.__manganessProtectionModule = null;
    window.__manganessProtectionSource = null;
    window.__manganessVrfInterceptor = null;
  }

  function isProtectionReady() {
    return !!findProtectionModule();
  }

  function ensureInterceptor(vmz) {
    if (typeof window.__manganessVrfInterceptor === 'function') {
      return window.__manganessVrfInterceptor;
    }
    if (typeof vmz.extendClient !== 'function') {
      return null;
    }
    var mockAxios = {
      interceptors: {
        request: {
          use: function(fn) { window.__manganessVrfInterceptor = fn; }
        },
        response: { use: function() {} }
      }
    };
    try {
      vmz.extendClient(mockAxios);
    } catch (e) {
      return null;
    }
    return typeof window.__manganessVrfInterceptor === 'function'
      ? window.__manganessVrfInterceptor
      : null;
  }

  function generateProtectionToken(path, params) {
    clearProtectionCache();
    var vmz = findProtectionModule();
    if (!vmz) {
      return Promise.reject(new Error('Protection module not loaded'));
    }

    try { if (typeof vmz.init === 'function') vmz.init(); } catch (e) {}

    var baseline = Object.assign({}, params || {});

    if (typeof vmz.getProtectionToken === 'function') {
      return Promise.resolve(vmz.getProtectionToken(path, Object.assign({}, baseline)))
        .then(function(token) {
          var extracted = extractTokenFromResult(token);
          if (extracted) return extracted;
          throw new Error('Protection token empty');
        })
        .catch(function(err) {
          // Fall through to interceptor path on soft failure.
          if (typeof vmz.extendClient !== 'function') {
            return Promise.reject(err);
          }
          return generateViaInterceptor(vmz, path, baseline);
        });
    }

    return generateViaInterceptor(vmz, path, baseline);
  }

  function generateViaInterceptor(vmz, path, baseline) {
    var interceptor = ensureInterceptor(vmz);
    if (!interceptor) {
      return Promise.reject(new Error('Protection interceptor unavailable'));
    }

    var cfg = {
      url: path,
      method: 'get',
      params: Object.assign({}, baseline),
      headers: {}
    };

    return Promise.resolve(interceptor(cfg)).then(function(out) {
      var result = out || cfg;
      var token = extractAuthToken(result.params, baseline);
      if (!token && result.headers) {
        // Some builds may place auth in headers instead of query params.
        for (var headerName in result.headers) {
          if (!Object.prototype.hasOwnProperty.call(result.headers, headerName)) continue;
          var headerValue = result.headers[headerName];
          if (looksLikeAuthToken(headerValue)) {
            token = headerValue;
            break;
          }
        }
      }
      if (!token) {
        throw new Error('Protection interceptor produced no auth token');
      }
      return token;
    });
  }

  function appendCanonicalParams(usp, params) {
    if (!params || typeof params !== 'object') return;
    Object.keys(params).forEach(function(key) {
      var value = params[key];
      if (value == null) return;
      if (Array.isArray(value)) {
        value.forEach(function(item, index) {
          usp.append(key + '[' + index + ']', String(item));
        });
        return;
      }
      if (typeof value === 'object') {
        Object.keys(value).forEach(function(child) {
          if (value[child] == null) return;
          usp.append(key + '[' + child + ']', String(value[child]));
        });
        return;
      }
      usp.append(key, String(value));
    });
  }

  function isMissingProtectionTokenError(error) {
    var message = String(error && error.message ? error.message : error || '');
    return (
      message.indexOf('produced no auth token') !== -1 ||
      message.indexOf('Protection token empty') !== -1
    );
  }

  function fetchProtectedJson(path, params) {
    var queryParams = Object.assign({}, params || {});
    // Always mint a VRF. MangaFire's shouldProtect() misses routes (title
    // details, some /top-titles calls) and a missing token is 403.
    return generateProtectionToken(path, queryParams).catch(function(error) {
      if (isMissingProtectionTokenError(error)) return null;
      throw error;
    }).then(function(vrf) {
      var usp = new URLSearchParams();
      appendCanonicalParams(usp, queryParams);
      if (vrf) usp.append('vrf', String(vrf));
      var qs = usp.toString();
      var url = '/api' + path + (qs ? '?' + qs : '');
      return fetch(url, {
        credentials: 'include',
        headers: {
          Accept: 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest'
        }
      }).then(function(response) {
        return response.text().then(function(text) {
          var data = text;
          try { data = JSON.parse(text); } catch (e) {}
          return {
            status: response.status,
            data: data,
            vrfAttached: !!vrf,
            vrfLength: vrf ? String(vrf).length : 0,
            protected: true
          };
        });
      });
    });
  }
`;

class MangaFireVrfBridge {
  private ready = false;
  private hostAttached = false;
  private webViewInject: ((script: string) => void) | null = null;
  private webViewReload: (() => void) | null = null;
  private reloadTimer: ReturnType<typeof setTimeout> | null = null;
  private challengeSeen = false;
  private challengeDismissed = false;
  private lastHostEvent: string | null = null;
  private pending: PendingVrfRequest[] = [];
  private pendingApi: PendingApiRequest[] = [];
  private uiListeners = new Set<(state: MangaFireVrfHostUiState) => void>();
  private readyWaiters: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }> = [];
  private challengeRecovery: Promise<void> | null = null;

  attachHost(
    injectJavaScript: (script: string) => void,
    handles?: MangaFireVrfHostHandles
  ) {
    this.hostAttached = true;
    this.webViewInject = injectJavaScript;
    this.webViewReload = handles?.reload ?? null;
    this.flushReadyWaiters();
  }

  detachHost() {
    this.hostAttached = false;
    this.webViewInject = null;
    this.webViewReload = null;
    this.ready = false;
    this.challengeSeen = false;
    this.challengeDismissed = false;
    this.lastHostEvent = null;
    this.challengeRecovery = null;
    this.clearReloadTimer();
    this.notifyHostUi();
    this.rejectAllPending(new Error('MangaFire VRF host detached'));
  }

  subscribeHostUi(
    listener: (state: MangaFireVrfHostUiState) => void
  ): () => void {
    this.uiListeners.add(listener);
    listener(this.getHostUiState());
    return () => {
      this.uiListeners.delete(listener);
    };
  }

  dismissChallenge() {
    this.challengeDismissed = true;
    this.notifyHostUi();
    logger().warn('Network', 'Cloudflare verification dismissed');
    this.rejectAllPending(new Error('Cloudflare verification dismissed'));
  }

  reportHostEvent(event: MangaFireVrfHostEvent) {
    const details = [
      event.type,
      event.url,
      event.title,
      event.statusCode != null ? `status=${event.statusCode}` : null,
      event.description,
    ]
      .filter(Boolean)
      .join(' ');
    this.lastHostEvent = details;

    if (event.type === 'terminated') {
      this.ready = false;
      this.challengeSeen = false;
      this.challengeDismissed = false;
      this.notifyHostUi();
      return;
    }

    // Document-level Cloudflare interstitials arrive as HTTP 403.
    if (event.type === 'httpError' && event.statusCode === 403) {
      this.markChallengeVisible('Cloudflare 403');
    }
  }

  markReady() {
    this.ready = true;
    this.clearReloadTimer();
    this.flushReadyWaiters();
    this.notifyHostUi();
  }

  handleMessage(rawMessage: string) {
    let message: VrfHostMessage;
    try {
      message = JSON.parse(rawMessage) as VrfHostMessage;
    } catch {
      return;
    }

    if (message.type === 'ready') {
      this.challengeSeen = false;
      this.challengeDismissed = false;
      this.clearReloadTimer();
      if (message.discovery) {
        logger().info('Network', 'MangaFire protection module discovered', {
          discovery: message.discovery,
        });
      }
      this.markReady();
      return;
    }

    if (message.type === 'challenge') {
      this.markChallengeVisible(message.title || 'Just a moment');
      return;
    }

    if (message.type === 'probe') {
      logger().warn('Network', 'MangaFire VRF host still waiting for protection module', {
        title: message.title,
        snippet: message.snippet,
      });
      return;
    }

    if (message.type === 'api') {
      this.resolveApiRequest(message);
      return;
    }

    if (message.type !== 'vrf' || !message.id) {
      return;
    }

    const pendingIndex = this.pending.findIndex(
      (request) => request.id === message.id
    );
    if (pendingIndex === -1) {
      return;
    }

    const request = this.pending.splice(pendingIndex, 1)[0];
    if (!request) {
      return;
    }
    clearTimeout(request.timeoutId);

    if (message.error || !message.vrf) {
      request.reject(
        new Error(message.error || 'Failed to generate MangaFire VRF token')
      );
      return;
    }

    request.resolve(message.vrf);
  }

  /**
   * Fetch MangaFire JSON from the hidden WebView so Cloudflare cookies
   * (cf_clearance) are sent. Native axios calls get challenged.
   */
  async fetchJson<T>(
    path: string,
    params?: Record<string, unknown>,
    options?: MangaFireHostFetchOptions
  ): Promise<{ status: number; data: T }> {
    if (useTestVrfToken) {
      throw new Error('MangaFire host fetch is disabled in tests');
    }

    let recoveries = 0;
    while (true) {
      await this.waitUntilReady();
      try {
        return await this.performHostFetch<T>(path, params, options);
      } catch (error) {
        if (
          !isCloudflareChallengeError(error) ||
          recoveries >= 2 ||
          !this.hostAttached ||
          this.challengeDismissed
        ) {
          throw error;
        }
        recoveries += 1;
        await this.beginChallengeRecovery();
      }
    }
  }

  /** Fetch a same-origin MangaFire HTML document with the host WebView cookies. */
  async fetchDocument(path: string): Promise<{ status: number; data: string }> {
    if (useTestVrfToken) {
      throw new Error('MangaFire host fetch is disabled in tests');
    }
    if (!path.startsWith('/') || path.startsWith('//')) {
      throw new Error('MangaFire document path must be same-origin');
    }

    let recoveries = 0;
    while (true) {
      await this.waitUntilReady();
      try {
        return await this.performHostDocumentFetch(path);
      } catch (error) {
        if (
          !isCloudflareChallengeError(error) ||
          recoveries >= 2 ||
          !this.hostAttached ||
          this.challengeDismissed
        ) {
          throw error;
        }
        recoveries += 1;
        await this.beginChallengeRecovery();
      }
    }
  }

  private performHostFetch<T>(
    path: string,
    params?: Record<string, unknown>,
    options?: MangaFireHostFetchOptions
  ): Promise<{ status: number; data: T }> {
    if (!this.webViewInject) {
      return Promise.reject(new Error('MangaFire VRF host is not available'));
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const validateStatus =
      options?.validateStatus ??
      ((status: number) => status >= 200 && status < 300);
    const script = `
      (function() {
        ${VRF_PROTECTION_HELPERS_JS}
        var requestId = ${JSON.stringify(id)};
        var path = ${JSON.stringify(path)};
        var params = ${JSON.stringify(params ?? {})};
        fetchProtectedJson(path, params)
          .then(function(result) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'api',
              id: requestId,
              status: result.status,
              data: result.data,
              vrfAttached: !!result.vrfAttached,
              vrfLength: result.vrfLength || 0,
              protected: result.protected
            }));
          })
          .catch(function(err) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'api',
              id: requestId,
              error: String(err && err.message ? err.message : err)
            }));
          });
        return true;
      })();
    `;

    return new Promise<{ status: number; data: T }>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.pendingApi.findIndex((item) => item.id === id);
        if (index !== -1) {
          this.pendingApi.splice(index, 1);
        }
        reject(new Error('Timed out waiting for MangaFire API response'));
      }, REQUEST_TIMEOUT_MS);

      this.pendingApi.push({
        id,
        path,
        resolve: (result) => resolve(result as { status: number; data: T }),
        reject,
        timeoutId,
        validateStatus,
      });

      try {
        this.webViewInject?.(script);
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingApi = this.pendingApi.filter((item) => item.id !== id);
        reject(
          error instanceof Error
            ? error
            : new Error('Failed to inject MangaFire API fetch script')
        );
      }
    });
  }

  private performHostDocumentFetch(
    path: string
  ): Promise<{ status: number; data: string }> {
    const injectJavaScript = this.webViewInject;
    if (!injectJavaScript) {
      return Promise.reject(new Error('MangaFire VRF host is not available'));
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const script = `
      (function() {
        var requestId = ${JSON.stringify(id)};
        var path = ${JSON.stringify(path)};
        fetch(path, {
          credentials: 'include',
          headers: { Accept: 'text/html,application/xhtml+xml' }
        })
          .then(function(response) {
            return response.text().then(function(text) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'api',
                id: requestId,
                status: response.status,
                data: text
              }));
            });
          })
          .catch(function(err) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'api',
              id: requestId,
              error: String(err && err.message ? err.message : err)
            }));
          });
        return true;
      })();
    `;

    return new Promise<{ status: number; data: string }>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.pendingApi.findIndex((item) => item.id === id);
        if (index !== -1) {
          this.pendingApi.splice(index, 1);
        }
        reject(new Error('Timed out waiting for MangaFire document response'));
      }, REQUEST_TIMEOUT_MS);

      this.pendingApi.push({
        id,
        path,
        resolve: (result) =>
          resolve(result as { status: number; data: string }),
        reject,
        timeoutId,
        validateStatus: (status) => status >= 200 && status < 300,
      });

      try {
        injectJavaScript(script);
      } catch (error) {
        clearTimeout(timeoutId);
        this.pendingApi = this.pendingApi.filter((item) => item.id !== id);
        reject(
          error instanceof Error
            ? error
            : new Error('Failed to inject MangaFire document fetch script')
        );
      }
    });
  }

  private markChallengeVisible(reason: string) {
    if (!this.challengeSeen || this.ready) {
      logger().warn('Network', 'MangaFire VRF host hit Cloudflare challenge', {
        title: reason,
      });
    }
    this.ready = false;
    this.challengeSeen = true;
    this.challengeDismissed = false;
    this.extendReadyWaitersForChallenge();
    this.notifyHostUi();
  }

  private beginChallengeRecovery(): Promise<void> {
    if (this.challengeRecovery) {
      return this.challengeRecovery;
    }

    const alreadyVisible = this.challengeSeen && !this.ready;
    this.markChallengeVisible('API response');
    if (!alreadyVisible) {
      this.webViewReload?.();
    }

    this.challengeRecovery = this.waitUntilReady().finally(() => {
      this.challengeRecovery = null;
    });
    return this.challengeRecovery;
  }

  private resolveApiRequest(
    message: Extract<VrfHostMessage, { type: 'api' }>
  ) {
    if (!message.id) {
      return;
    }

    const pendingIndex = this.pendingApi.findIndex(
      (request) => request.id === message.id
    );
    if (pendingIndex === -1) {
      return;
    }

    const request = this.pendingApi.splice(pendingIndex, 1)[0];
    if (!request) {
      return;
    }
    clearTimeout(request.timeoutId);

    if (message.error) {
      request.reject(new Error(message.error));
      return;
    }

    const status = message.status ?? 0;
    const data = message.data;

    if (isCloudflareChallenge(data)) {
      logger().warn('Network', 'MangaFire host API hit Cloudflare challenge', {
        path: request.path,
        status,
      });
      request.reject(
        createHttpError(status || 403, data, 'Cloudflare verification detected')
      );
      return;
    }

    if (!request.validateStatus(status)) {
      const body =
        typeof data === 'string'
          ? data.replace(/\s+/g, ' ').trim().slice(0, 240)
          : data && typeof data === 'object'
            ? JSON.stringify(data).slice(0, 240)
            : undefined;
      logger().warn('Network', 'MangaFire host API rejected', {
        path: request.path,
        status,
        vrfAttached: message.vrfAttached ?? null,
        vrfLength: message.vrfLength ?? null,
        protected: message.protected ?? null,
        ...(body ? { body } : {}),
      });
      request.reject(createHttpError(status, data));
      return;
    }

    request.resolve({ status, data });
  }

  async getVrfToken(
    path: string,
    params?: Record<string, unknown>
  ): Promise<string | null> {
    if (useTestVrfToken) {
      return 'test-vrf-token';
    }

    const moduleStartedAt = Date.now();
    try {
      await this.waitUntilReady();
    } finally {
      reportWait('vrf_module', Date.now() - moduleStartedAt);
    }

    const vrfRequest: VrfRequest = {
      path,
      params: params ?? {},
    };
    const tokenStartedAt = Date.now();
    try {
      return await this.requestVrfToken(vrfRequest);
    } finally {
      reportWait('vrf_token', Date.now() - tokenStartedAt);
    }
  }

  private async waitUntilReady(): Promise<void> {
    if (this.ready && !this.challengeSeen) {
      return;
    }

    if (!this.hostAttached) {
      throw new Error('MangaFire VRF host is not available');
    }

    if (this.challengeSeen && this.challengeDismissed) {
      this.challengeDismissed = false;
      this.notifyHostUi();
    }

    this.scheduleHostReloadIfNeeded();

    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.readyWaiters.findIndex(
          (waiter) => waiter.timeoutId === timeoutId
        );
        if (index !== -1) {
          this.readyWaiters.splice(index, 1);
        }
        reject(new Error(this.buildReadyTimeoutMessage()));
      }, this.challengeSeen ? MANGA_FIRE_VRF_CHALLENGE_WAIT_MS : REQUEST_TIMEOUT_MS);

      this.readyWaiters.push({ resolve, reject, timeoutId });
    });
  }

  private extendReadyWaitersForChallenge() {
    for (const waiter of this.readyWaiters) {
      clearTimeout(waiter.timeoutId);
      waiter.timeoutId = setTimeout(() => {
        const index = this.readyWaiters.indexOf(waiter);
        if (index !== -1) {
          this.readyWaiters.splice(index, 1);
        }
        waiter.reject(new Error(this.buildReadyTimeoutMessage()));
      }, MANGA_FIRE_VRF_CHALLENGE_WAIT_MS);
    }
  }

  private getHostUiState(): MangaFireVrfHostUiState {
    return {
      challengeVisible:
        this.challengeSeen && !this.ready && !this.challengeDismissed,
      ready: this.ready,
    };
  }

  private notifyHostUi() {
    const state = this.getHostUiState();
    for (const listener of this.uiListeners) {
      listener(state);
    }
  }

  private scheduleHostReloadIfNeeded() {
    if (this.ready || this.challengeSeen || this.reloadTimer || !this.webViewReload) {
      return;
    }

    this.reloadTimer = setTimeout(() => {
      this.reloadTimer = null;
      if (this.ready || this.challengeSeen) {
        return;
      }
      logger().warn('Service', 'MangaFire VRF host still not ready, reloading WebView', {
        lastHostEvent: this.lastHostEvent,
      });
      this.webViewReload?.();
    }, HOST_RELOAD_AFTER_MS);
  }

  private clearReloadTimer() {
    if (this.reloadTimer) {
      clearTimeout(this.reloadTimer);
      this.reloadTimer = null;
    }
  }

  private buildReadyTimeoutMessage(): string {
    const parts = ['Timed out waiting for MangaFire protection module'];
    if (this.challengeSeen) {
      parts.push('Cloudflare challenge still active');
    }
    if (this.lastHostEvent) {
      parts.push(this.lastHostEvent);
    }
    return parts.join(' — ');
  }

  private flushReadyWaiters() {
    if (!this.ready) {
      return;
    }

    for (const waiter of this.readyWaiters) {
      clearTimeout(waiter.timeoutId);
      waiter.resolve();
    }
    this.readyWaiters = [];
  }

  private async requestVrfToken(request: VrfRequest): Promise<string> {
    if (!this.webViewInject) {
      throw new Error('MangaFire VRF host is not available');
    }

    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const script = `
      (function() {
        ${VRF_PROTECTION_HELPERS_JS}
        var requestId = ${JSON.stringify(id)};
        var path = ${JSON.stringify(request.path)};
        var params = ${JSON.stringify(request.params ?? {})};
        generateProtectionToken(path, params)
          .then(function(vrf) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'vrf',
              id: requestId,
              vrf: vrf || null
            }));
          })
          .catch(function(err) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'vrf',
              id: requestId,
              error: String(err && err.message ? err.message : err)
            }));
          });
        return true;
      })();
    `;

    return new Promise<string>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.pending.findIndex((item) => item.id === id);
        if (index !== -1) {
          this.pending.splice(index, 1);
        }
        reject(new Error('Timed out waiting for MangaFire VRF token'));
      }, REQUEST_TIMEOUT_MS);

      const pendingRequest: PendingVrfRequest = {
        id,
        path: request.path,
        resolve,
        reject,
        timeoutId,
      };
      if (request.params) {
        pendingRequest.params = request.params;
      }
      this.pending.push(pendingRequest);

      try {
        this.webViewInject?.(script);
      } catch (error) {
        clearTimeout(timeoutId);
        this.pending = this.pending.filter((item) => item.id !== id);
        reject(
          error instanceof Error
            ? error
            : new Error('Failed to inject MangaFire VRF script')
        );
      }
    });
  }

  private rejectAllPending(error: Error) {
    for (const request of this.pending) {
      clearTimeout(request.timeoutId);
      request.reject(error);
    }
    this.pending = [];

    for (const request of this.pendingApi) {
      clearTimeout(request.timeoutId);
      request.reject(error);
    }
    this.pendingApi = [];

    for (const waiter of this.readyWaiters) {
      clearTimeout(waiter.timeoutId);
      waiter.reject(error);
    }
    this.readyWaiters = [];
  }
}

export const mangaFireVrfBridge = new MangaFireVrfBridge();

export function buildVrfScript(): string {
  return `
    (function() {
      ${VRF_PROTECTION_HELPERS_JS}
      var notified = false;
      var challengeNotified = false;
      var probeNotified = false;
      var startedAt = Date.now();

      function pageSnippet() {
        try {
          return String(document.documentElement && document.documentElement.innerHTML || '').slice(0, 240);
        } catch (e) {
          return '';
        }
      }

      function looksLikeChallenge() {
        var html = pageSnippet().toLowerCase();
        var title = '';
        try { title = String(document.title || '').toLowerCase(); } catch (e) {}
        return (
          title.indexOf('just a moment') !== -1 ||
          html.indexOf('just a moment') !== -1 ||
          html.indexOf('cf-browser-verification') !== -1 ||
          html.indexOf('challenge-platform') !== -1 ||
          html.indexOf('cf-mitigated') !== -1
        );
      }

      function notifyChallenge() {
        if (challengeNotified || !looksLikeChallenge()) return;
        challengeNotified = true;
        var title = '';
        try { title = document.title || ''; } catch (e) {}
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'challenge',
          title: title
        }));
      }

      function notifyProbe() {
        if (probeNotified || notified) return;
        if (Date.now() - startedAt < 8000) return;
        probeNotified = true;
        var title = '';
        try { title = document.title || ''; } catch (e) {}
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'probe',
          title: title,
          snippet: pageSnippet()
        }));
      }

      function notifyReady() {
        if (notified) return;
        notifyChallenge();
        notifyProbe();
        if (isProtectionReady()) {
          notified = true;
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'ready',
            discovery: window.__manganessProtectionSource || 'unknown'
          }));
          return;
        }
        setTimeout(notifyReady, 100);
      }
      notifyReady();
      // Modules often arrive after the initial document load (ESM/polyfill).
      try {
        if (typeof MutationObserver === 'function' && document.documentElement) {
          var observer = new MutationObserver(function() { notifyReady(); });
          observer.observe(document.documentElement, { childList: true, subtree: true });
          setTimeout(function() { try { observer.disconnect(); } catch (e) {} }, 30000);
        }
      } catch (e) {}
      true;
    })();
  `;
}

export async function appendVrfParams(
  path: string,
  params?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const vrf = await mangaFireVrfBridge.getVrfToken(path, params);
  if (!vrf) {
    return { ...(params ?? {}) };
  }

  return {
    ...(params ?? {}),
    vrf,
  };
}

export function logVrfFailure(path: string, error: unknown) {
  logger().error('Network', 'Failed to acquire MangaFire VRF token', {
    path,
    error,
  });
}
