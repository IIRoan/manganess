/**
 * @deprecated FULLY DEPRECATED - Part of Zedux state migration Phase 7 cleanup.
 * This service is no longer maintained and will be removed once all consumers are migrated.
 *
 * Use the Zedux-based offline cache atom and hooks instead:
 * - `atoms/offlineCacheAtom.ts` for the atom definition
 * - `atoms/selectors/cacheSelectors.ts` for derived cache selectors
 * - `hooks/useCachedData.ts` for React hook access
 *
 * @see atoms/offlineCacheAtom.ts
 * @see hooks/useCachedData.ts
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MangaDetails, MangaItem } from '@/types';
import { logger } from '@/utils/logger';
import { imageCache } from '@/services/CacheImages';

const OFFLINE_MANGA_CACHE_KEY = 'offline_manga_cache';
const OFFLINE_SEARCH_CACHE_KEY = 'offline_search_cache';
const OFFLINE_HOME_CACHE_KEY = 'offline_home_cache';

export interface CachedMangaDetails extends MangaDetails {
  cachedAt: number;
  isBookmarked: boolean;
  bookmarkStatus?: string;
}

export interface CachedSearchResults {
  query: string;
  results: MangaItem[];
  cachedAt: number;
}

export interface CachedHomeData {
  mostViewed: MangaItem[];
  newReleases: MangaItem[];
  featuredManga: MangaItem | null;
  cachedAt: number;
}

/** @deprecated Use `offlineCacheAtom` and `useCachedData` hook instead. */
class OfflineCacheService {
  private static instance: OfflineCacheService;

  private constructor() {}

  static getInstance(): OfflineCacheService {
    if (!OfflineCacheService.instance) {
      OfflineCacheService.instance = new OfflineCacheService();
    }
    return OfflineCacheService.instance;
  }

  // Manga Details Caching
  async cacheMangaDetails(
    mangaId: string,
    details: MangaDetails,
    isBookmarked: boolean = false
  ): Promise<void> {
    try {
      const cachedDetails: CachedMangaDetails = {
        ...details,
        cachedAt: Date.now(),
        isBookmarked,
      };

      const existingCache = await this.getAllCachedMangaDetails();
      existingCache[mangaId] = cachedDetails;

      await AsyncStorage.setItem(
        OFFLINE_MANGA_CACHE_KEY,
        JSON.stringify(existingCache)
      );

      // Cache the banner image permanently for offline access
      if (details.bannerImage) {
        try {
          await imageCache.getCachedImagePath(
            details.bannerImage,
            'manga',
            mangaId
          );
        } catch (imageError) {
          logger().warn('Storage', 'Failed to cache manga banner image', {
            error: imageError,
            mangaId,
            bannerUrl: details.bannerImage,
          });
        }
      }

      logger().debug('Storage', 'Cached manga details', {
        mangaId,
        title: details.title,
        isBookmarked,
      });
    } catch (error) {
      logger().error('Storage', 'Failed to cache manga details', {
        error,
        mangaId,
      });
    }
  }

  async getCachedMangaDetails(
    mangaId: string
  ): Promise<CachedMangaDetails | null> {
    try {
      const cache = await this.getAllCachedMangaDetails();
      return cache[mangaId] || null;
    } catch (error) {
      logger().error('Storage', 'Failed to get cached manga details', {
        error,
        mangaId,
      });
      return null;
    }
  }

  async getAllCachedMangaDetails(): Promise<
    Record<string, CachedMangaDetails>
  > {
    try {
      const cached = await AsyncStorage.getItem(OFFLINE_MANGA_CACHE_KEY);
      return cached ? JSON.parse(cached) : {};
    } catch (error) {
      logger().error('Storage', 'Failed to get all cached manga details', {
        error,
      });
      return {};
    }
  }

  async getBookmarkedMangaDetails(): Promise<CachedMangaDetails[]> {
    try {
      const allCached = await this.getAllCachedMangaDetails();
      return Object.values(allCached).filter((manga) => manga.isBookmarked);
    } catch (error) {
      logger().error('Storage', 'Failed to get bookmarked manga details', {
        error,
      });
      return [];
    }
  }

  async removeMangaFromCache(mangaId: string): Promise<void> {
    try {
      const cache = await this.getAllCachedMangaDetails();
      delete cache[mangaId];
      await AsyncStorage.setItem(
        OFFLINE_MANGA_CACHE_KEY,
        JSON.stringify(cache)
      );

      logger().debug('Storage', 'Removed manga from cache', { mangaId });
    } catch (error) {
      logger().error('Storage', 'Failed to remove manga from cache', {
        error,
        mangaId,
      });
    }
  }

  async updateMangaBookmarkStatus(
    mangaId: string,
    isBookmarked: boolean
  ): Promise<void> {
    try {
      const cache = await this.getAllCachedMangaDetails();
      if (cache[mangaId]) {
        cache[mangaId].isBookmarked = isBookmarked;
        await AsyncStorage.setItem(
          OFFLINE_MANGA_CACHE_KEY,
          JSON.stringify(cache)
        );

        logger().debug('Storage', 'Updated manga bookmark status', {
          mangaId,
          isBookmarked,
        });
      }
    } catch (error) {
      logger().error('Storage', 'Failed to update manga bookmark status', {
        error,
        mangaId,
      });
    }
  }

  // Search Results Caching
  async cacheSearchResults(query: string, results: MangaItem[]): Promise<void> {
    try {
      const cachedSearch: CachedSearchResults = {
        query: query.toLowerCase().trim(),
        results,
        cachedAt: Date.now(),
      };

      const existingCache = await this.getAllCachedSearchResults();
      existingCache[cachedSearch.query] = cachedSearch;

      // Keep only the last 10 search queries to save space
      const queries = Object.keys(existingCache);
      if (queries.length > 10) {
        const sortedQueries = queries.sort(
          (a, b) =>
            (existingCache[b]?.cachedAt || 0) -
            (existingCache[a]?.cachedAt || 0)
        );
        const toKeep = sortedQueries.slice(0, 10);
        const newCache: Record<string, CachedSearchResults> = {};
        toKeep.forEach((q) => {
          if (existingCache[q]) {
            newCache[q] = existingCache[q];
          }
        });
        await AsyncStorage.setItem(
          OFFLINE_SEARCH_CACHE_KEY,
          JSON.stringify(newCache)
        );
      } else {
        await AsyncStorage.setItem(
          OFFLINE_SEARCH_CACHE_KEY,
          JSON.stringify(existingCache)
        );
      }

      // Cache images for search results
      results.forEach(async (manga) => {
        if (manga.banner || manga.imageUrl) {
          try {
            const imageUrl = manga.banner || manga.imageUrl;
            if (imageUrl) {
              await imageCache.getCachedImagePath(imageUrl, 'search', manga.id);
            }
          } catch (imageError) {
            logger().warn('Storage', 'Failed to cache search result image', {
              error: imageError,
              mangaId: manga.id,
              imageUrl: manga.banner || manga.imageUrl,
            });
          }
        }
      });

      logger().debug('Storage', 'Cached search results', {
        query,
        resultCount: results.length,
      });
    } catch (error) {
      logger().error('Storage', 'Failed to cache search results', {
        error,
        query,
      });
    }
  }

  async getCachedSearchResults(
    query: string
  ): Promise<CachedSearchResults | null> {
    try {
      const cache = await this.getAllCachedSearchResults();
      const normalizedQuery = query.toLowerCase().trim();
      return cache[normalizedQuery] || null;
    } catch (error) {
      logger().error('Storage', 'Failed to get cached search results', {
        error,
        query,
      });
      return null;
    }
  }

  async getAllCachedSearchResults(): Promise<
    Record<string, CachedSearchResults>
  > {
    try {
      const cached = await AsyncStorage.getItem(OFFLINE_SEARCH_CACHE_KEY);
      return cached ? JSON.parse(cached) : {};
    } catch (error) {
      logger().error('Storage', 'Failed to get all cached search results', {
        error,
      });
      return {};
    }
  }

  // Home Data Caching
  async cacheHomeData(
    mostViewed: MangaItem[],
    newReleases: MangaItem[],
    featuredManga: MangaItem | null
  ): Promise<void> {
    try {
      const cachedHome: CachedHomeData = {
        mostViewed,
        newReleases,
        featuredManga,
        cachedAt: Date.now(),
      };

      await AsyncStorage.setItem(
        OFFLINE_HOME_CACHE_KEY,
        JSON.stringify(cachedHome)
      );

      // Cache images for home data
      const allManga = [...mostViewed, ...newReleases];
      if (featuredManga) {
        allManga.push(featuredManga);
      }

      allManga.forEach(async (manga) => {
        if (manga.banner || manga.imageUrl) {
          try {
            const imageUrl = manga.banner || manga.imageUrl;
            if (imageUrl) {
              await imageCache.getCachedImagePath(imageUrl, 'manga', manga.id);
            }
          } catch (imageError) {
            logger().warn('Storage', 'Failed to cache home data image', {
              error: imageError,
              mangaId: manga.id,
              imageUrl: manga.banner || manga.imageUrl,
            });
          }
        }
      });

      logger().debug('Storage', 'Cached home data', {
        mostViewedCount: mostViewed.length,
        newReleasesCount: newReleases.length,
        hasFeatured: !!featuredManga,
      });
    } catch (error) {
      logger().error('Storage', 'Failed to cache home data', { error });
    }
  }

  async getCachedHomeData(): Promise<CachedHomeData | null> {
    try {
      const cached = await AsyncStorage.getItem(OFFLINE_HOME_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      logger().error('Storage', 'Failed to get cached home data', { error });
      return null;
    }
  }

  // Utility Methods
  async clearAllCache(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(OFFLINE_MANGA_CACHE_KEY),
        AsyncStorage.removeItem(OFFLINE_SEARCH_CACHE_KEY),
        AsyncStorage.removeItem(OFFLINE_HOME_CACHE_KEY),
      ]);

      logger().info('Storage', 'Cleared all offline cache');
    } catch (error) {
      logger().error('Storage', 'Failed to clear offline cache', { error });
    }
  }

  async getCacheStats(): Promise<{
    mangaCount: number;
    bookmarkedCount: number;
    searchQueriesCount: number;
    hasHomeData: boolean;
    totalSizeEstimate: string;
  }> {
    try {
      const [mangaCache, searchCache, homeCache] = await Promise.all([
        this.getAllCachedMangaDetails(),
        this.getAllCachedSearchResults(),
        this.getCachedHomeData(),
      ]);

      const mangaCount = Object.keys(mangaCache).length;
      const bookmarkedCount = Object.values(mangaCache).filter(
        (m) => m.isBookmarked
      ).length;
      const searchQueriesCount = Object.keys(searchCache).length;
      const hasHomeData = !!homeCache;

      // Rough size estimate (this is approximate)
      const mangaCacheSize = JSON.stringify(mangaCache).length;
      const searchCacheSize = JSON.stringify(searchCache).length;
      const homeCacheSize = homeCache ? JSON.stringify(homeCache).length : 0;
      const totalBytes = mangaCacheSize + searchCacheSize + homeCacheSize;

      const totalSizeEstimate = this.formatBytes(totalBytes);

      return {
        mangaCount,
        bookmarkedCount,
        searchQueriesCount,
        hasHomeData,
        totalSizeEstimate,
      };
    } catch (error) {
      logger().error('Storage', 'Failed to get cache stats', { error });
      return {
        mangaCount: 0,
        bookmarkedCount: 0,
        searchQueriesCount: 0,
        hasHomeData: false,
        totalSizeEstimate: '0 B',
      };
    }
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const offlineCacheService = OfflineCacheService.getInstance();
