import { MANGA_CACHE_REFRESH_MIN_INTERVAL_MS } from '@/constants/mangaCache';
import { logger } from '@/utils/logger';

export const REQUEST_HUB_TTLS = {
  mangaDetails: MANGA_CACHE_REFRESH_MIN_INTERVAL_MS,
  chapters: MANGA_CACHE_REFRESH_MIN_INTERVAL_MS,
  titleMeta: 60 * 60 * 1000,
  search: 2 * 60 * 1000,
  home: 15 * 60 * 1000,
  chapterPages: 30 * 60 * 1000,
  genre: 10 * 60 * 1000,
} as const;

const MAX_CONCURRENT_REQUESTS = 2;
const MIN_REQUEST_GAP_MS = 400;

interface CacheEntry {
  value: unknown;
  cachedAt: number;
}

const memoryCache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<unknown>>();

let activeRequests = 0;
let lastDispatchAt = 0;
const pendingSlots: Array<() => void> = [];

async function acquireRateLimitSlot(): Promise<void> {
  while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise<void>((resolve) => {
      pendingSlots.push(resolve);
    });
  }

  const gap = MIN_REQUEST_GAP_MS - (Date.now() - lastDispatchAt);
  if (gap > 0) {
    await new Promise((resolve) => setTimeout(resolve, gap));
  }

  activeRequests += 1;
  lastDispatchAt = Date.now();
}

function releaseRateLimitSlot(): void {
  activeRequests = Math.max(0, activeRequests - 1);
  pendingSlots.shift()?.();
}

export async function withMangaFireRateLimit<T>(
  operation: () => Promise<T>
): Promise<T> {
  await acquireRateLimitSlot();
  try {
    return await operation();
  } finally {
    releaseRateLimitSlot();
  }
}

export function peekFreshCache<T>(key: string, ttlMs: number): T | undefined {
  const cached = memoryCache.get(key);
  if (!cached) {
    return undefined;
  }

  if (Date.now() - cached.cachedAt >= ttlMs) {
    return undefined;
  }

  return cached.value as T;
}

export interface ScheduleMangaFireRequestOptions {
  ttlMs?: number;
  force?: boolean;
}

export async function scheduleMangaFireRequest<T>(
  key: string,
  operation: () => Promise<T>,
  options: ScheduleMangaFireRequestOptions = {}
): Promise<T> {
  // Guard against undefined TTLs from require-cycle init (ttlMs > 0 would skip cache).
  const ttlMs =
    typeof options.ttlMs === 'number' && Number.isFinite(options.ttlMs)
      ? options.ttlMs
      : MANGA_CACHE_REFRESH_MIN_INTERVAL_MS;
  const force = options.force === true;
  const log = logger();

  if (!force && ttlMs > 0) {
    const cached = peekFreshCache<T>(key, ttlMs);
    if (cached !== undefined) {
      log.info('Network', 'MangaFire request hub cache hit', { key });
      return cached;
    }
  }

  const existing = inFlight.get(key);
  if (existing && !force) {
    log.info('Network', 'MangaFire request hub coalesced', { key });
    return existing as Promise<T>;
  }

  const promise = operation()
    .then((value) => {
      memoryCache.set(key, { value, cachedAt: Date.now() });
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise;
}

export function primeMangaFireRequestCache(key: string, value: unknown): void {
  memoryCache.set(key, { value, cachedAt: Date.now() });
}

export function invalidateMangaFireRequestCache(keyPrefix?: string): void {
  if (!keyPrefix) {
    memoryCache.clear();
    return;
  }

  for (const key of memoryCache.keys()) {
    if (key.startsWith(keyPrefix)) {
      memoryCache.delete(key);
    }
  }
}

export function resetMangaFireRequestHubForTests(): void {
  memoryCache.clear();
  inFlight.clear();
  activeRequests = 0;
  lastDispatchAt = 0;
  pendingSlots.length = 0;
}
