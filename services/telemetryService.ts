import { requireOptionalNativeModule } from 'expo-modules-core';
import { getTelemetryProject, getTelemetryUrl, isTelemetryEnabled } from '@/constants/telemetry';
import type { TelemetryEvent } from '@/types/telemetry';
import { collectTelemetryRuntime } from '@/utils/collectTelemetryRuntime';
import { sanitizeTelemetryRoute } from '@/utils/sanitizeTelemetryRoute';

const TOKEN_KEY = 'manganess.telemetry.installToken';

type SecureStoreApi = {
  AFTER_FIRST_UNLOCK?: number | string;
  isAvailableAsync: () => Promise<boolean>;
  getItemAsync: (
    key: string,
    options?: Record<string, unknown>
  ) => Promise<string | null>;
  setItemAsync: (
    key: string,
    value: string,
    options?: Record<string, unknown>
  ) => Promise<void>;
  deleteItemAsync: (
    key: string,
    options?: Record<string, unknown>
  ) => Promise<void>;
};

let secureStore: SecureStoreApi | null | undefined;
let cachedToken: string | null | undefined;
let pendingToken: Promise<string | null> | null = null;

export function resetTelemetryForTests(): void {
  cachedToken = undefined;
  pendingToken = null;
  secureStore = undefined;
}

function getSecureStore(): SecureStoreApi | null {
  if (secureStore !== undefined) {
    return secureStore;
  }
  try {
    if (!requireOptionalNativeModule('ExpoSecureStore')) {
      secureStore = null;
      return null;
    }
    // Native module is present (after a rebuild). Safe to load the JS wrapper.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    secureStore = require('expo-secure-store') as SecureStoreApi;
  } catch {
    secureStore = null;
  }
  return secureStore;
}

function storeOptions(): Record<string, unknown> | undefined {
  const store = getSecureStore();
  if (!store?.AFTER_FIRST_UNLOCK) {
    return undefined;
  }
  return { keychainAccessible: store.AFTER_FIRST_UNLOCK };
}

async function readStoredToken(): Promise<string | null> {
  const store = getSecureStore();
  if (!store) {
    return null;
  }
  try {
    if (!(await store.isAvailableAsync())) {
      return null;
    }
    const value = await store.getItemAsync(TOKEN_KEY, storeOptions());
    return value && value.length >= 32 ? value : null;
  } catch {
    return null;
  }
}

async function writeStoredToken(token: string): Promise<void> {
  const store = getSecureStore();
  if (!store) {
    return;
  }
  try {
    if (await store.isAvailableAsync()) {
      await store.setItemAsync(TOKEN_KEY, token, storeOptions());
    }
  } catch {
    // In-memory cache still covers this session.
  }
}

async function clearStoredToken(): Promise<void> {
  cachedToken = undefined;
  const store = getSecureStore();
  if (!store) {
    return;
  }
  try {
    if (await store.isAvailableAsync()) {
      await store.deleteItemAsync(TOKEN_KEY, storeOptions());
    }
  } catch {
    // ignore
  }
}

async function registerInstall(baseUrl: string): Promise<string | null> {
  const response = await fetch(`${baseUrl}/v1/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: getTelemetryProject() }),
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { token?: unknown };
  if (typeof body.token !== 'string' || body.token.length < 32) {
    return null;
  }
  return body.token;
}

async function ensureInstallToken(baseUrl: string): Promise<string | null> {
  if (cachedToken) {
    return cachedToken;
  }
  if (pendingToken) {
    return pendingToken;
  }
  pendingToken = (async () => {
    const stored = await readStoredToken();
    if (stored) {
      cachedToken = stored;
      return stored;
    }
    const registered = await registerInstall(baseUrl);
    if (!registered) {
      return null;
    }
    await writeStoredToken(registered);
    cachedToken = registered;
    return registered;
  })().finally(() => {
    pendingToken = null;
  });
  return pendingToken;
}

async function postEvent(
  event: TelemetryEvent,
  retried = false
): Promise<void> {
  if (!isTelemetryEnabled()) {
    return;
  }
  const baseUrl = getTelemetryUrl().replace(/\/$/, '');
  const token = await ensureInstallToken(baseUrl);
  if (!token) {
    return;
  }
  const response = await fetch(`${baseUrl}/v1/events`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  });
  if (response.status === 401 && !retried) {
    await clearStoredToken();
    await postEvent(event, true);
  }
}

function enqueue(event: TelemetryEvent): void {
  try {
    const payload: TelemetryEvent = {
      ...collectTelemetryRuntime(),
      ...event,
    };
    void postEvent(payload).catch(() => {
      // Offline or server down — local error log still has the record.
    });
  } catch {
    // Telemetry must never take down logger.error or other callers.
  }
}

export function reportErrorEvent(event: Omit<TelemetryEvent, 'kind'>): void {
  enqueue({ ...event, kind: 'error' });
}

export function reportMetric(event: Omit<TelemetryEvent, 'kind'>): void {
  enqueue({ ...event, kind: 'metric' });
}

/** Keep wait-phase names short, stable, and free of manga ids or paths. */
export function sanitizeWaitPhase(waitFor: string): string | null {
  const phase = waitFor
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return phase.length > 0 ? phase : null;
}

/**
 * Named load-phase timing so the dashboard can show what a screen waited on
 * (network, VRF, disk) instead of a single TTI number.
 */
export function reportWait(
  waitFor: string,
  durationMs: number,
  route?: string
): void {
  const phase = sanitizeWaitPhase(waitFor);
  if (!phase || !Number.isFinite(durationMs) || durationMs < 0) {
    return;
  }
  const event: Omit<TelemetryEvent, 'kind'> = {
    name: `wait.${phase}`,
    durationMs: Math.round(durationMs),
  };
  if (route) {
    event.route = sanitizeTelemetryRoute(route);
  }
  reportMetric(event);
}

export async function timeWait<T>(
  waitFor: string,
  operation: () => Promise<T>,
  route?: string
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await operation();
  } finally {
    reportWait(waitFor, Date.now() - startedAt, route);
  }
}
