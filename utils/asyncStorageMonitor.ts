import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDebugEnabled } from '@/constants/env';
import { logger } from '@/utils/logger';

// Use readonly tuple types matching AsyncStorage's public API
type KeyVal = readonly [string, string];

type Patched = Partial<typeof AsyncStorage> & { __patched?: boolean };

let originals: Partial<typeof AsyncStorage> | null = null;

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
      log.info('Storage', 'getItem', { key, durationMs: Math.round(dur) });
    }
  };

  AsyncStorage.setItem = async (key: string, value: string) => {
    const start = (globalThis as any).performance?.now?.() ?? Date.now();
    try {
      return await originals!.setItem!(key, value);
    } finally {
      const dur =
        ((globalThis as any).performance?.now?.() ?? Date.now()) - start;
      log.info('Storage', 'setItem', {
        key,
        size: value?.length ?? 0,
        durationMs: Math.round(dur),
      });
    }
  };

  AsyncStorage.multiGet = async (keys: readonly string[]) => {
    const start = (globalThis as any).performance?.now?.() ?? Date.now();
    try {
      return await originals!.multiGet!(keys as readonly string[]);
    } finally {
      const dur =
        ((globalThis as any).performance?.now?.() ?? Date.now()) - start;
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
      log.info('Storage', 'removeItem', { key, durationMs: Math.round(dur) });
    }
  };

  AsyncStorage.clear = async () => {
    const start = (globalThis as any).performance?.now?.() ?? Date.now();
    try {
      return await originals!.clear!();
    } finally {
      const dur =
        ((globalThis as any).performance?.now?.() ?? Date.now()) - start;
      log.info('Storage', 'clear', { durationMs: Math.round(dur) });
    }
  };

  (store as Patched).__patched = true;
  log.info('Storage', 'AsyncStorage monitor enabled');
}

export function disableAsyncStorageLogging() {
  if (!originals) return;
  Object.assign(AsyncStorage, originals);
  originals = null;
}
