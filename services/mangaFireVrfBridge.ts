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

type VrfHostMessage =
  | { type: 'ready' }
  | { type: 'vrf'; id: string; vrf?: string | null; error?: string };

const REQUEST_TIMEOUT_MS = 20000;
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

function requiresVrfToken(path: string): boolean {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return !normalized.startsWith('/top-titles');
}

class MangaFireVrfBridge {
  private ready = false;
  private hostAttached = false;
  private webViewInject: ((script: string) => void) | null = null;
  private pending: PendingVrfRequest[] = [];
  private readyWaiters: Array<{
    resolve: () => void;
    reject: (error: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
  }> = [];

  attachHost(injectJavaScript: (script: string) => void) {
    this.hostAttached = true;
    this.webViewInject = injectJavaScript;
    this.flushReadyWaiters();
  }

  detachHost() {
    this.hostAttached = false;
    this.webViewInject = null;
    this.ready = false;
    this.rejectAllPending(new Error('MangaFire VRF host detached'));
  }

  markReady() {
    this.ready = true;
    this.flushReadyWaiters();
  }

  handleMessage(rawMessage: string) {
    let message: VrfHostMessage;
    try {
      message = JSON.parse(rawMessage) as VrfHostMessage;
    } catch {
      return;
    }

    if (message.type === 'ready') {
      this.markReady();
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

  async getVrfToken(
    path: string,
    params?: Record<string, unknown>
  ): Promise<string | null> {
    if (!requiresVrfToken(path)) {
      return null;
    }

    if (useTestVrfToken) {
      return 'test-vrf-token';
    }

    await this.waitUntilReady();
    const vrfRequest: VrfRequest = { path };
    if (params) {
      vrfRequest.params = params;
    }
    return this.requestVrfToken(vrfRequest);
  }

  private async waitUntilReady(): Promise<void> {
    if (this.ready) {
      return;
    }

    if (!this.hostAttached) {
      throw new Error('MangaFire VRF host is not available');
    }

    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        const index = this.readyWaiters.findIndex(
          (waiter) => waiter.timeoutId === timeoutId
        );
        if (index !== -1) {
          this.readyWaiters.splice(index, 1);
        }
        reject(new Error('Timed out waiting for MangaFire protection module'));
      }, REQUEST_TIMEOUT_MS);

      this.readyWaiters.push({ resolve, reject, timeoutId });
    });
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
        var requestId = ${JSON.stringify(id)};
        var path = ${JSON.stringify(request.path)};
        var params = ${JSON.stringify(request.params ?? {})};
        try {
          var vmz = window.vmz_b5512e;
          if (!vmz || typeof vmz.extendClient !== 'function') {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'vrf',
              id: requestId,
              error: 'Protection module not loaded'
            }));
            return true;
          }
          if (!window.__manganessVrfInterceptor) {
            try { vmz.init(); } catch (e) {}
            var mockAxios = {
              interceptors: {
                request: {
                  use: function(fn) { window.__manganessVrfInterceptor = fn; }
                },
                response: { use: function() {} }
              }
            };
            vmz.extendClient(mockAxios);
          }
          var cfg = {
            url: path,
            method: 'get',
            params: Object.assign({}, params),
            headers: {}
          };
          Promise.resolve(window.__manganessVrfInterceptor(cfg))
            .then(function(out) {
              var result = out || cfg;
              var vrf = result.params && result.params.vrf;
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
                error: String(err)
              }));
            });
        } catch (err) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'vrf',
            id: requestId,
            error: String(err)
          }));
        }
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
      function notifyReady() {
        if (window.vmz_b5512e && window.__config) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
          return;
        }
        setTimeout(notifyReady, 100);
      }
      notifyReady();
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
  logger().warn('Network', 'Failed to acquire MangaFire VRF token', {
    path,
    error: error instanceof Error ? error.message : String(error),
  });
}
