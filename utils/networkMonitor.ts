import axios, { AxiosInstance } from 'axios';
import { isDebugEnabled } from '@/constants/env';
import { logger } from '@/utils/logger';

type AnyConfig = any;

let installed = false;
let ejectors: Array<() => void> = [];

/** HTTP statuses the client may recover from (e.g. stale chapter ID → re-resolve). */
export function isSoftNetworkFailureStatus(status: unknown): boolean {
  return status === 404;
}

function shortUrl(url?: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    const path =
      u.pathname +
      (u.search
        ? u.search.length > 60
          ? u.search.slice(0, 57) + '…'
          : u.search
        : '');
    return `${u.host}${path}`;
  } catch {
    return url.length > 80 ? url.slice(0, 77) + '…' : url;
  }
}

export function installNetworkMonitor(instance?: AxiosInstance) {
  if (!isDebugEnabled() || installed) return;
  const log = logger();
  const ax = instance ?? axios;
  const reqId = () => Math.random().toString(36).slice(2, 8);

  const req = ax.interceptors.request.use((config: AnyConfig) => {
    const now = (globalThis as any).performance?.now?.() ?? Date.now();
    (config as AnyConfig).metadata = { start: now, id: reqId() };
    const method = (config.method || 'get').toUpperCase();
    const bodySize =
      typeof config.data === 'string'
        ? config.data.length
        : config.data
          ? JSON.stringify(config.data).length
          : 0;
    log.debug('Network', `➡️ ${method} ${shortUrl(config.url)}`, {
      id: (config as AnyConfig).metadata.id,
      bodySize,
      params: config.params,
    });
    return config;
  });

  const res = ax.interceptors.response.use(
    (response) => {
      const meta = (response.config as AnyConfig).metadata;
      const start =
        meta?.start ?? (globalThis as any).performance?.now?.() ?? Date.now();
      const dur =
        ((globalThis as any).performance?.now?.() ?? Date.now()) - start;
      const method = (response.config.method || 'get').toUpperCase();
      const lenHeader =
        response.headers?.['content-length'] ??
        response.headers?.['Content-Length'];
      const size = lenHeader ? Number(lenHeader) : undefined;
      log.info(
        'Network',
        `✅ ${method} ${shortUrl(response.config.url)} ${response.status}`,
        {
          id: meta?.id,
          durationMs: Math.round(dur),
          size,
        }
      );
      return response;
    },
    (error) => {
      const cfg: AnyConfig | undefined = error.config;
      const meta = cfg?.metadata;
      const start =
        meta?.start ?? (globalThis as any).performance?.now?.() ?? Date.now();
      const dur =
        ((globalThis as any).performance?.now?.() ?? Date.now()) - start;
      const url = cfg?.url;
      const method = (cfg?.method || 'GET').toUpperCase();
      const status = error.response?.status;
      const soft = isSoftNetworkFailureStatus(status);
      const message = `${soft ? '⚠️' : '❌'} ${method} ${shortUrl(url)}${
        status ? ` ${status}` : ''
      }`;
      const payload = {
        id: meta?.id,
        durationMs: Math.round(dur),
        error: String(error),
        ...(soft ? { recoverable: true } : {}),
      };

      // 404s are often recovered by the client (stale chapter IDs, etc.).
      if (soft) {
        logger().warn('Network', message, payload);
      } else {
        logger().error('Network', message, payload);
      }
      return Promise.reject(error);
    }
  );

  ejectors = [
    () => ax.interceptors.request.eject(req),
    () => ax.interceptors.response.eject(res),
  ];
  installed = true;
  log.info('Network', 'Axios network monitor installed');
}

export function uninstallNetworkMonitor() {
  if (!installed) return;
  ejectors.forEach((fn) => fn());
  ejectors = [];
  installed = false;
}

/** Test helper — reset module install state between Jest cases. */
export function resetNetworkMonitorForTests() {
  uninstallNetworkMonitor();
}
