import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '@/utils/logger';

interface PersistenceConfig<T = any> {
  key: string;
  debounceMs?: number;
  serialize?: (value: T) => string;
  deserialize?: (value: string) => T;
}

/**
 * Zedux plugin for persisting atom state to AsyncStorage
 *
 * Features:
 * - Loads initial state from AsyncStorage on atom creation
 * - Debounces writes to avoid excessive I/O
 * - Handles serialization/deserialization
 * - Integrates with logger for error tracking
 *
 * @param config - Configuration for persistence
 * @returns Plugin function for Zedux atom
 */
export const asyncStoragePlugin = <T = any>(config: PersistenceConfig<T>) => {
  const {
    key,
    debounceMs = 300,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
  } = config;

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const log = logger();

  return (instance: any) => {
    // Load initial state from AsyncStorage
    const loadInitialState = async () => {
      try {
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          const parsed = deserialize(stored);
          instance.setState(parsed);
          log.info('Storage', 'Loaded persisted state', { key });
        }
      } catch (error) {
        log.error('Storage', 'Failed to load persisted state', {
          key,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    // Persist state changes with debouncing
    const persistState = (state: T) => {
      if (timeoutId) clearTimeout(timeoutId);

      timeoutId = setTimeout(async () => {
        try {
          await AsyncStorage.setItem(key, serialize(state));
          log.info('Storage', 'Persisted state', { key });
        } catch (error) {
          log.error('Storage', 'Failed to persist state', {
            key,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }, debounceMs);
    };

    // Load initial state asynchronously
    loadInitialState();

    // Subscribe to state changes using the 'on' method
    // Handle both atom instances (with 'on' method) and stores (with 'subscribe' method)
    let cleanup: (() => void) | undefined;

    if (typeof instance.on === 'function') {
      // AtomInstance - use 'on' method
      cleanup = instance.on('state', ({ newState }: any) => {
        persistState(newState);
      });
    } else if (typeof instance.subscribe === 'function') {
      // Store - use 'subscribe' method
      const unsubscribe = instance.subscribe({
        effects: ({ newState }: any) => {
          persistState(newState);
        },
      });
      cleanup = () => unsubscribe();
    } else {
      log.error('Storage', 'Invalid instance type for asyncStoragePlugin', {
        key,
      });
      cleanup = () => {};
    }

    // Cleanup function
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (cleanup) cleanup();
    };
  };
};
