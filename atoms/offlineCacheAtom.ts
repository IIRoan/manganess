import {
  atom,
  injectStore,
  injectEffect,
  injectAtomValue,
  api,
} from '@zedux/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  OfflineCacheAtomState,
  CachedMangaDetails,
  CachedSearchResults,
  CachedHomeData,
} from '@/types/atoms';
import { MangaDetails, MangaItem } from '@/types';
import { networkAtom } from '@/atoms/networkAtom';
import { logger } from '@/utils/logger';

// AsyncStorage keys - matching existing offlineCacheService keys
const OFFLINE_MANGA_CACHE_KEY = 'offline_manga_cache';
const OFFLINE_SEARCH_CACHE_KEY = 'offline_search_cache';
const OFFLINE_HOME_CACHE_KEY = 'offline_home_cache';

// Cache TTL: 24 hours for manga details, 1 hour for search/home
const MANGA_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const SEARCH_CACHE_TTL_MS = 60 * 60 * 1000;
const HOME_CACHE_TTL_MS = 60 * 60 * 1000;

// Max search cache entries to keep
const MAX_SEARCH_CACHE_ENTRIES = 10;

/**
 * Offline Cache Atom
 *
 * Manages offline cache for manga details, search results, and home data.
 * Implements stale-while-revalidate: returns cached data immediately while
 * fresh data is fetched in the background when online.
 *
 * Key behaviors:
 * - Loads all cache from AsyncStorage on initialization
 * - Manga details cached for 24 hours; search/home cached for 1 hour
 * - Expired entries return null (caller should fetch fresh data)
 * - Limits search cache to MAX_SEARCH_CACHE_ENTRIES (LRU eviction)
 * - Integrates with networkAtom to detect offline state
 *
 * Dependencies: networkAtom (for offline detection)
 * Persistence: AsyncStorage keys:
 *   - `offline_manga_cache` (manga details)
 *   - `offline_search_cache` (search results)
 *   - `offline_home_cache` (home screen data)
 *
 * @see hooks/useCachedData.ts for React hook access
 * @see atoms/selectors/cacheSelectors.ts for derived selectors
 * @see Requirements 9.1–9.5
 */

const DEFAULT_STATE: OfflineCacheAtomState = {
  mangaDetailsCache: new Map(),
  searchCache: new Map(),
  homeCache: null,
};

export const offlineCacheAtom = atom('offlineCache', () => {
  const store = injectStore<OfflineCacheAtomState>(DEFAULT_STATE);
  const networkState = injectAtomValue(networkAtom);

  // Periodic cleanup of expired entries (every 30 minutes)
  injectEffect(() => {
    const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
    const intervalId = setInterval(() => {
      const now = Date.now();
      const currentState = store.getState();
      let changed = false;

      const newMangaCache = new Map(currentState.mangaDetailsCache);
      newMangaCache.forEach((entry, key) => {
        if (now > entry.expiresAt) {
          newMangaCache.delete(key);
          changed = true;
        }
      });

      const newSearchCache = new Map(currentState.searchCache);
      newSearchCache.forEach((entry, key) => {
        if (now > entry.expiresAt) {
          newSearchCache.delete(key);
          changed = true;
        }
      });

      const newHomeCache =
        currentState.homeCache && now > currentState.homeCache.expiresAt
          ? null
          : currentState.homeCache;
      if (newHomeCache !== currentState.homeCache) changed = true;

      if (changed) {
        store.setState({
          mangaDetailsCache: newMangaCache,
          searchCache: newSearchCache,
          homeCache: newHomeCache,
        });
        logger().debug(
          'Storage',
          'Periodic cleanup: removed expired cache entries'
        );
      }
    }, CLEANUP_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, []);

  // Load all caches from AsyncStorage on initialization
  injectEffect(() => {
    const loadCaches = async () => {
      const log = logger();
      try {
        const [mangaRaw, searchRaw, homeRaw] = await Promise.all([
          AsyncStorage.getItem(OFFLINE_MANGA_CACHE_KEY),
          AsyncStorage.getItem(OFFLINE_SEARCH_CACHE_KEY),
          AsyncStorage.getItem(OFFLINE_HOME_CACHE_KEY),
        ]);

        const mangaDetailsCache = new Map<string, CachedMangaDetails>();
        if (mangaRaw) {
          const parsed: Record<string, CachedMangaDetails> =
            JSON.parse(mangaRaw);
          for (const [key, value] of Object.entries(parsed)) {
            mangaDetailsCache.set(key, value);
          }
        }

        const searchCache = new Map<string, CachedSearchResults>();
        if (searchRaw) {
          const parsed: Record<string, CachedSearchResults> =
            JSON.parse(searchRaw);
          for (const [key, value] of Object.entries(parsed)) {
            searchCache.set(key, value);
          }
        }

        const homeCache: CachedHomeData | null = homeRaw
          ? JSON.parse(homeRaw)
          : null;

        store.setState({ mangaDetailsCache, searchCache, homeCache });
        log.info('Storage', 'Loaded offline caches', {
          mangaCount: mangaDetailsCache.size,
          searchCount: searchCache.size,
          hasHome: !!homeCache,
        });
      } catch (error) {
        log.error('Storage', 'Failed to load offline caches', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    loadCaches();
  }, []);

  // Persist manga details cache to AsyncStorage
  const persistMangaCache = async (cache: Map<string, CachedMangaDetails>) => {
    try {
      const obj: Record<string, CachedMangaDetails> = {};
      cache.forEach((value, key) => {
        obj[key] = value;
      });
      await AsyncStorage.setItem(OFFLINE_MANGA_CACHE_KEY, JSON.stringify(obj));
    } catch (error) {
      logger().error('Storage', 'Failed to persist manga cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Persist search cache to AsyncStorage
  const persistSearchCache = async (
    cache: Map<string, CachedSearchResults>
  ) => {
    try {
      const obj: Record<string, CachedSearchResults> = {};
      cache.forEach((value, key) => {
        obj[key] = value;
      });
      await AsyncStorage.setItem(OFFLINE_SEARCH_CACHE_KEY, JSON.stringify(obj));
    } catch (error) {
      logger().error('Storage', 'Failed to persist search cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Persist home cache to AsyncStorage
  const persistHomeCache = async (homeCache: CachedHomeData | null) => {
    try {
      if (homeCache) {
        await AsyncStorage.setItem(
          OFFLINE_HOME_CACHE_KEY,
          JSON.stringify(homeCache)
        );
      } else {
        await AsyncStorage.removeItem(OFFLINE_HOME_CACHE_KEY);
      }
    } catch (error) {
      logger().error('Storage', 'Failed to persist home cache', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /**
   * Cache manga details. Implements stale-while-revalidate:
   * always stores fresh data, returns immediately.
   */
  const cacheMangaDetails = async (
    mangaId: string,
    details: MangaDetails,
    isBookmarked: boolean = false
  ) => {
    const now = Date.now();
    const entry: CachedMangaDetails = {
      data: { ...details, isBookmarked } as any,
      timestamp: now,
      expiresAt: now + MANGA_CACHE_TTL_MS,
    };

    const currentState = store.getState();
    const newCache = new Map(currentState.mangaDetailsCache);
    newCache.set(mangaId, entry);
    store.setState({ ...currentState, mangaDetailsCache: newCache });

    await persistMangaCache(newCache);
    logger().debug('Storage', 'Cached manga details', { mangaId });
  };

  /**
   * Get cached manga details. Returns null if expired.
   * Implements stale-while-revalidate: if online, returns stale data
   * and triggers background revalidation.
   */
  const getCachedMangaDetails = (
    mangaId: string
  ): (MangaDetails & { isBookmarked?: boolean; cachedAt?: number }) | null => {
    const state = store.getState();
    const entry = state.mangaDetailsCache.get(mangaId);
    if (!entry) return null;

    const now = Date.now();
    // If offline, return even expired data
    if (networkState.isOffline) {
      return entry.data as any;
    }

    // If expired, return null (caller should fetch fresh)
    if (now > entry.expiresAt) {
      return null;
    }

    return entry.data as any;
  };

  /**
   * Cache search results for a query.
   */
  const cacheSearchResults = async (query: string, results: MangaItem[]) => {
    const normalizedQuery = query.toLowerCase().trim();
    const now = Date.now();
    const entry: CachedSearchResults = {
      data: { query: normalizedQuery, results },
      timestamp: now,
      expiresAt: now + SEARCH_CACHE_TTL_MS,
    };

    const currentState = store.getState();
    const newCache = new Map(currentState.searchCache);
    newCache.set(normalizedQuery, entry);

    // Enforce max entries: remove oldest if over limit
    if (newCache.size > MAX_SEARCH_CACHE_ENTRIES) {
      let oldestKey: string | null = null;
      let oldestTime = Infinity;
      newCache.forEach((val, key) => {
        if (val.timestamp < oldestTime) {
          oldestTime = val.timestamp;
          oldestKey = key;
        }
      });
      if (oldestKey) newCache.delete(oldestKey);
    }

    store.setState({ ...currentState, searchCache: newCache });
    await persistSearchCache(newCache);
    logger().debug('Storage', 'Cached search results', {
      query,
      count: results.length,
    });
  };

  /**
   * Get cached search results. Returns null if expired.
   */
  const getCachedSearchResults = (
    query: string
  ): { query: string; results: MangaItem[] } | null => {
    const normalizedQuery = query.toLowerCase().trim();
    const state = store.getState();
    const entry = state.searchCache.get(normalizedQuery);
    if (!entry) return null;

    const now = Date.now();
    if (!networkState.isOffline && now > entry.expiresAt) {
      return null;
    }

    return entry.data as any;
  };

  /**
   * Cache home page data.
   */
  const cacheHomeData = async (
    mostViewed: MangaItem[],
    newReleases: MangaItem[],
    featuredManga: MangaItem | null
  ) => {
    const now = Date.now();
    const entry: CachedHomeData = {
      data: { mostViewed, newReleases, featuredManga },
      timestamp: now,
      expiresAt: now + HOME_CACHE_TTL_MS,
    };

    const currentState = store.getState();
    store.setState({ ...currentState, homeCache: entry });
    await persistHomeCache(entry);
    logger().debug('Storage', 'Cached home data', {
      mostViewedCount: mostViewed.length,
      newReleasesCount: newReleases.length,
    });
  };

  /**
   * Get cached home data. Returns null if expired.
   */
  const getCachedHomeData = (): {
    mostViewed: MangaItem[];
    newReleases: MangaItem[];
    featuredManga: MangaItem | null;
    cachedAt: number;
  } | null => {
    const state = store.getState();
    if (!state.homeCache) return null;

    const now = Date.now();
    if (!networkState.isOffline && now > state.homeCache.expiresAt) {
      return null;
    }

    return {
      ...(state.homeCache.data as any),
      cachedAt: state.homeCache.timestamp,
    };
  };

  /**
   * Update bookmark status for a cached manga.
   */
  const updateMangaBookmarkStatus = async (
    mangaId: string,
    isBookmarked: boolean
  ) => {
    const currentState = store.getState();
    const entry = currentState.mangaDetailsCache.get(mangaId);
    if (!entry) return;

    const newCache = new Map(currentState.mangaDetailsCache);
    newCache.set(mangaId, {
      ...entry,
      data: { ...entry.data, isBookmarked } as any,
    });
    store.setState({ ...currentState, mangaDetailsCache: newCache });
    await persistMangaCache(newCache);
  };

  /**
   * Remove a manga from the cache.
   */
  const removeMangaFromCache = async (mangaId: string) => {
    const currentState = store.getState();
    const newCache = new Map(currentState.mangaDetailsCache);
    newCache.delete(mangaId);
    store.setState({ ...currentState, mangaDetailsCache: newCache });
    await persistMangaCache(newCache);
  };

  /**
   * Get all bookmarked manga from cache.
   */
  const getBookmarkedMangaDetails = (): Array<
    MangaDetails & { isBookmarked?: boolean; cachedAt?: number }
  > => {
    const state = store.getState();
    const result: Array<
      MangaDetails & { isBookmarked?: boolean; cachedAt?: number }
    > = [];
    state.mangaDetailsCache.forEach((entry) => {
      const data = entry.data as any;
      if (data?.isBookmarked) {
        result.push({ ...data, cachedAt: entry.timestamp });
      }
    });
    return result;
  };

  /**
   * Clear all caches.
   */
  const clearAllCache = async () => {
    store.setState(DEFAULT_STATE);
    try {
      await Promise.all([
        AsyncStorage.removeItem(OFFLINE_MANGA_CACHE_KEY),
        AsyncStorage.removeItem(OFFLINE_SEARCH_CACHE_KEY),
        AsyncStorage.removeItem(OFFLINE_HOME_CACHE_KEY),
      ]);
      logger().info('Storage', 'Cleared all offline caches');
    } catch (error) {
      logger().error('Storage', 'Failed to clear offline caches', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  /**
   * Get cache statistics.
   */
  const getCacheStats = () => {
    const state = store.getState();
    const mangaCount = state.mangaDetailsCache.size;
    let bookmarkedCount = 0;
    state.mangaDetailsCache.forEach((entry) => {
      if ((entry.data as any)?.isBookmarked) bookmarkedCount++;
    });
    return {
      mangaCount,
      bookmarkedCount,
      searchQueriesCount: state.searchCache.size,
      hasHomeData: !!state.homeCache,
    };
  };

  /**
   * Clean up expired cache entries.
   */
  const cleanExpiredEntries = async () => {
    const now = Date.now();
    const currentState = store.getState();
    let changed = false;

    const newMangaCache = new Map(currentState.mangaDetailsCache);
    newMangaCache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        newMangaCache.delete(key);
        changed = true;
      }
    });

    const newSearchCache = new Map(currentState.searchCache);
    newSearchCache.forEach((entry, key) => {
      if (now > entry.expiresAt) {
        newSearchCache.delete(key);
        changed = true;
      }
    });

    const newHomeCache =
      currentState.homeCache && now > currentState.homeCache.expiresAt
        ? null
        : currentState.homeCache;
    if (newHomeCache !== currentState.homeCache) changed = true;

    if (changed) {
      store.setState({
        mangaDetailsCache: newMangaCache,
        searchCache: newSearchCache,
        homeCache: newHomeCache,
      });
      await Promise.all([
        persistMangaCache(newMangaCache),
        persistSearchCache(newSearchCache),
        persistHomeCache(newHomeCache),
      ]);
      logger().debug('Storage', 'Cleaned expired cache entries');
    }
  };

  return api(store).setExports({
    cacheMangaDetails,
    getCachedMangaDetails,
    cacheSearchResults,
    getCachedSearchResults,
    cacheHomeData,
    getCachedHomeData,
    updateMangaBookmarkStatus,
    removeMangaFromCache,
    getBookmarkedMangaDetails,
    clearAllCache,
    getCacheStats,
    cleanExpiredEntries,
  });
});
