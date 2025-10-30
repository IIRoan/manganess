import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDebugEnabled } from '@/constants/env';
import { logger } from '@/utils/logger';

// Use readonly tuple types matching AsyncStorage's public API
type KeyVal = readonly [string, string];

type Patched = Partial<typeof AsyncStorage> & { __patched?: boolean };

let originals: Partial<typeof AsyncStorage> | null = null;

// Rate limiting and deduplication for storage operations
const RATE_LIMIT_WINDOW = 1000; // 1 second
const MAX_LOGS_PER_WINDOW = 5; // Reduced from 10 to 5
const DEBOUNCE_DELAY = 200; // Increased from 100ms to 200ms

// Keys that should have reduced logging (frequent access patterns)
const FREQUENT_KEYS = new Set([
  'download_settings',
  'download_usage_stats',
  'app_settings',
  'theme_settings',
]);

// Operations that should be logged less frequently for frequent keys
const REDUCED_LOGGING_OPERATIONS = new Set(['getItem']);

interface LogEntry {
  key: string;
  operation: string;
  count: number;
  totalDuration: number;
  lastLogged: number;
}

const logCounts = new Map<string, LogEntry>();
const debounceTimers = new Map<string, any>();

function shouldLogOperation(key: string, operation: string): boolean {
  const now = Date.now();
  const logKey = `${operation}:${key}`;
  const entry = logCounts.get(logKey);

  // Apply stricter limits for frequent keys
  const isFrequentKey = FREQUENT_KEYS.has(key);
  const isReducedLoggingOp = REDUCED_LOGGING_OPERATIONS.has(operation);
  const maxLogs = isFrequentKey && isReducedLoggingOp ? 2 : MAX_LOGS_PER_WINDOW;

  if (!entry) {
    logCounts.set(logKey, {
      key,
      operation,
      count: 1,
      totalDuration: 0,
      lastLogged: now,
    });
    // For frequent keys with reduced logging operations, only log every 3rd call initially
    return !(isFrequentKey && isReducedLoggingOp && Math.random() > 0.3);
  }

  // Reset count if window has passed
  if (now - entry.lastLogged > RATE_LIMIT_WINDOW) {
    entry.count = 1;
    entry.totalDuration = 0;
    entry.lastLogged = now;
    return !(isFrequentKey && isReducedLoggingOp && Math.random() > 0.3);
  }

  entry.count++;

  // Only log if under rate limit
  return entry.count <= maxLogs;
}

function logDebouncedOperation(
  operation: string,
  key: string,
  duration: number,
  data?: any
) {
  const log = logger();
  const logKey = `${operation}:${key}`;
  const entry = logCounts.get(logKey);

  if (entry) {
    entry.totalDuration += duration;
  }

  // Clear existing timer
  const existingTimer = debounceTimers.get(logKey);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  // Set new debounced timer
  const timer = setTimeout(() => {
    const finalEntry = logCounts.get(logKey);
    if (finalEntry && finalEntry.count > 1) {
      // Log aggregated data for repeated operations
      log.info('Storage', `${operation} (${finalEntry.count}x)`, {
        key,
        avgDurationMs: Math.round(finalEntry.totalDuration / finalEntry.count),
        totalDurationMs: Math.round(finalEntry.totalDuration),
        count: finalEntry.count,
        ...data,
      });
    } else if (finalEntry) {
      // Log single operation normally
      log.info('Storage', operation, {
        key,
        durationMs: Math.round(duration),
        ...data,
      });
    }
    debounceTimers.delete(logKey);
  }, DEBOUNCE_DELAY);

  debounceTimers.set(logKey, timer);
}

export function enableAsyncStorageLogging() {
  if (!isDebugEnabled()) return;
  const store = AsyncStorage as Patched;
  if (store.__patched) return;

  originals = {
    getItem: AsyncStorage.getItem,
    setItem: AsyncStorage.setItem,
    multiGet: AsyncStorage.multiGet,
    multiSet: AsyncStorage.multiSet,
    getAllKeys: AsyncStorage.getAllKeys,
    removeItem: AsyncStorage.removeItem,
    clear: AsyncStorage.clear,
  };

  const log = logger();

  AsyncStorage.getItem = async (key: string) => {
    const start = (globalThis as any).performance?.now?.() ?? Date.now();
    try {
      return await originals!.getItem!(key);
    } finally {
      const dur =
        ((globalThis as any).performance?.now?.() ?? Date.now()) - start;

      if (shouldLogOperation(key, 'getItem')) {
        logDebouncedOperation('getItem', key, dur);
      }
    }
  };

  AsyncStorage.setItem = async (key: string, value: string) => {
    const start = (globalThis as any).performance?.now?.() ?? Date.now();
    try {
      return await originals!.setItem!(key, value);
    } finally {
      const dur =
        ((globalThis as any).performance?.now?.() ?? Date.now()) - start;

      if (shouldLogOperation(key, 'setItem')) {
        logDebouncedOperation('setItem', key, dur, {
          size: value?.length ?? 0,
        });
      }
    }
  };

  AsyncStorage.multiGet = async (keys: readonly string[]) => {
    const start = (globalThis as any).performance?.now?.() ?? Date.now();
    try {
      return await originals!.multiGet!(keys as readonly string[]);
    } finally {
      const dur =
        ((globalThis as any).performance?.now?.() ?? Date.now()) - start;

      // Always log multiGet as it's less frequent
      log.info('Storage', 'multiGet', {
        keys: keys.length,
        durationMs: Math.round(dur),
      });
    }
  };

  AsyncStorage.multiSet = async (pairs: readonly KeyVal[]) => {
    const start = (globalThis as any).performance?.now?.() ?? Date.now();
    try {
      return await originals!.multiSet!(
        pairs as readonly (readonly [string, string])[]
      );
    } finally {
      const dur =
        ((globalThis as any).performance?.now?.() ?? Date.now()) - start;

      // Always log multiSet as it's less frequent
      log.info('Storage', 'multiSet', {
        pairs: pairs.length,
        durationMs: Math.round(dur),
      });
    }
  };

  AsyncStorage.getAllKeys = async () => {
    const start = (globalThis as any).performance?.now?.() ?? Date.now();
    try {
      return await originals!.getAllKeys!();
    } finally {
      const dur =
        ((globalThis as any).performance?.now?.() ?? Date.now()) - start;

      // Always log getAllKeys as it's less frequent
      log.info('Storage', 'getAllKeys', { durationMs: Math.round(dur) });
    }
  };

  AsyncStorage.removeItem = async (key: string) => {
    const start = (globalThis as any).performance?.now?.() ?? Date.now();
    try {
      return await originals!.removeItem!(key);
    } finally {
      const dur =
        ((globalThis as any).performance?.now?.() ?? Date.now()) - start;

      if (shouldLogOperation(key, 'removeItem')) {
        logDebouncedOperation('removeItem', key, dur);
      }
    }
  };

  AsyncStorage.clear = async () => {
    const start = (globalThis as any).performance?.now?.() ?? Date.now();
    try {
      return await originals!.clear!();
    } finally {
      const dur =
        ((globalThis as any).performance?.now?.() ?? Date.now()) - start;

      // Always log clear as it's infrequent but important
      log.info('Storage', 'clear', { durationMs: Math.round(dur) });
    }
  };

  (store as Patched).__patched = true;
  log.info('Storage', 'AsyncStorage monitor enabled');
}

export function disableAsyncStorageLogging() {
  if (!originals) return;

  // Clear all timers
  debounceTimers.forEach((timer) => clearTimeout(timer));
  debounceTimers.clear();
  logCounts.clear();

  Object.assign(AsyncStorage, originals);
  originals = null;
}
