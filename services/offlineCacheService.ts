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
import { RECENT_MANGA_HEADER_CACHE_LIMIT } from '@/constants/mangaCache';
import { logger } from '@/utils/logger';
import { imageCache } from '@/services/CacheImages';
import { mergeMangaDetailsRefresh } from '@/utils/mangaDetailsMerge';
import {
  areCachedMangaHeadersEquivalent,
  extractMangaHeader,
  hasLoadedMangaHeader,
  pruneMangaHeaderCache,
  type CachedMangaHeader,
} from '@/utils/mangaHeader';
import { isChapterListCacheComplete } from '@/utils/chapterListPagination';

const OFFLINE_MANGA_CACHE_KEY = 'offline_manga_cache';
const OFFLINE_MANGA_HEADER_CACHE_KEY = 'offline_manga_header_cache';
const OFFLINE_SEARCH_CACHE_KEY = 'offline_search_cache';
const OFFLINE_HOME_CACHE_KEY = 'offline_home_cache';

export interface CachedMangaDetails extends MangaDetails {
  cachedAt: number;
  isBookmarked: boolean;
  bookmarkStatus?: string;
  chapterPagination?: {
    nextPage: number;
    hasMore: boolean;
    lastPage?: number;
  };
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
  private memoryCache: Record<string, CachedMangaDetails> | null = null;
  private headerMemoryCache: Record<string, CachedMangaHeader> | null = null;
  private detailsLoad: Promise<Record<string, CachedMangaDetails>> | null =
    null;
  private headerLoad: Promise<Record<string, CachedMangaHeader>> | null = null;
  private detailsLoadGeneration = 0;
  private headerLoadGeneration = 0;

  private constructor() { }

  static getInstance(): OfflineCacheService {
    if (!OfflineCacheService.instance) {
      OfflineCacheService.instance = new OfflineCacheService();
    }
    return OfflineCacheService.instance;
  }

  // Manga Details Caching
  async cacheMangaDetails(
    mangaId: string,
    details: MangaDetails & {
      chapterPagination?: CachedMangaDetails['chapterPagination'];
    },
    isBookmarked: boolean = false
  ): Promise<void> {
    try {
      const existingCache = await this.getAllCachedMangaDetails();
      const existing = existingCache[mangaId];
      const mergedDetails = mergeMangaDetailsRefresh(
        existing ?? null,
        details,
        mangaId
      );
      // Never let a page-1 refresh mark a durable full list incomplete again — but only trust seals that actually reach the series start (not 40–90).
      const incomingPagination = details.chapterPagination;
      const existingPagination = existing?.chapterPagination;
      const existingIsTrustedComplete =
        existingPagination?.hasMore === false &&
        isChapterListCacheComplete(existing);
      const nextPagination =
        existingIsTrustedComplete && incomingPagination?.hasMore === true
          ? existingPagination
          : (incomingPagination ?? existingPagination);
      const cachedDetails: CachedMangaDetails = {
        ...mergedDetails,
        cachedAt: Date.now(),
        isBookmarked: isBookmarked || existing?.isBookmarked === true,
        ...(nextPagination ? { chapterPagination: nextPagination } : {}),
      };

      if (this.areCachedDetailsEquivalent(existing, cachedDetails)) {
        existingCache[mangaId] = cachedDetails;
        this.memoryCache = existingCache;
        await AsyncStorage.setItem(
          OFFLINE_MANGA_CACHE_KEY,
          JSON.stringify(existingCache)
        );
        await this.cacheMangaHeader(mangaId, cachedDetails, {
          isBookmarked: cachedDetails.isBookmarked,
        });
        return;
      }

      existingCache[mangaId] = cachedDetails;
      this.memoryCache = existingCache;

      await AsyncStorage.setItem(
        OFFLINE_MANGA_CACHE_KEY,
        JSON.stringify(existingCache)
      );

      await this.cacheMangaHeader(mangaId, cachedDetails, {
        isBookmarked: cachedDetails.isBookmarked,
      });

      // Cache the banner image permanently for offline access
      if (cachedDetails.bannerImage) {
        try {
          await imageCache.getCachedImagePath(
            cachedDetails.bannerImage,
            'manga',
            mangaId
          );
        } catch (imageError) {
          logger().warn('Storage', 'Failed to cache manga banner image', {
            error: imageError,
            mangaId,
            bannerUrl: cachedDetails.bannerImage,
          });
        }
      }

      logger().debug('Storage', 'Cached manga details', {
        mangaId,
        title: cachedDetails.title,
        isBookmarked: cachedDetails.isBookmarked,
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

  /** Replace a chapter's MangaFire API id in the offline details cache. Used after stale-ID recovery so the next open does not 404 again. */
  async patchCachedChapterApiId(
    mangaId: string,
    chapterNumber: string,
    chapterApiId: string
  ): Promise<boolean> {
    const normalizedMangaId = mangaId.trim();
    const normalizedChapter = String(chapterNumber ?? '').trim();
    const normalizedApiId = String(chapterApiId ?? '').trim();
    if (!normalizedMangaId || !normalizedChapter || !normalizedApiId) {
      return false;
    }

    try {
      const cache = await this.getAllCachedMangaDetails();
      const existing = cache[normalizedMangaId];
      if (!existing?.chapters?.length) {
        return false;
      }

      const nextUrl = `/chapter/${normalizedApiId}`;
      let changed = false;
      const chapters = existing.chapters.map((chapter) => {
        if (String(chapter.number).trim() !== normalizedChapter) {
          return chapter;
        }
        if (chapter.url === nextUrl) {
          return chapter;
        }
        changed = true;
        return { ...chapter, url: nextUrl };
      });

      if (!changed) {
        return false;
      }

      cache[normalizedMangaId] = {
        ...existing,
        chapters,
        cachedAt: Date.now(),
      };
      this.memoryCache = cache;
      await AsyncStorage.setItem(
        OFFLINE_MANGA_CACHE_KEY,
        JSON.stringify(cache)
      );

      logger().info('Storage', 'Patched cached chapter API id after recovery', {
        mangaId: normalizedMangaId,
        chapterNumber: normalizedChapter,
        chapterApiId: normalizedApiId,
      });
      return true;
    } catch (error) {
      logger().warn('Storage', 'Failed to patch cached chapter API id', {
        error,
        mangaId: normalizedMangaId,
        chapterNumber: normalizedChapter,
        chapterApiId: normalizedApiId,
      });
      return false;
    }
  }

  async getAllCachedMangaDetails(): Promise<
    Record<string, CachedMangaDetails>
  > {
    if (this.memoryCache !== null) {
      return this.memoryCache;
    }

    if (!this.detailsLoad) {
      const generation = this.detailsLoadGeneration;
      this.detailsLoad = this.readDetailsCacheFromDisk()
        .then((parsed) => {
          if (generation === this.detailsLoadGeneration) {
            this.memoryCache = parsed;
          }
          return this.memoryCache ?? parsed;
        })
        .finally(() => {
          if (generation === this.detailsLoadGeneration) {
            this.detailsLoad = null;
          }
        });
    }

    return this.detailsLoad;
  }

  private async readDetailsCacheFromDisk(): Promise<
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

  invalidateMemoryCache(): void {
    this.detailsLoadGeneration += 1;
    this.headerLoadGeneration += 1;
    this.memoryCache = null;
    this.headerMemoryCache = null;
    this.detailsLoad = null;
    this.headerLoad = null;
  }

  async getAllCachedMangaHeaders(): Promise<Record<string, CachedMangaHeader>> {
    if (this.headerMemoryCache !== null) {
      return this.headerMemoryCache;
    }

    if (!this.headerLoad) {
      const generation = this.headerLoadGeneration;
      this.headerLoad = this.readHeaderCacheFromDisk()
        .then((parsed) => {
          if (generation === this.headerLoadGeneration) {
            this.headerMemoryCache = parsed;
          }
          return this.headerMemoryCache ?? parsed;
        })
        .finally(() => {
          if (generation === this.headerLoadGeneration) {
            this.headerLoad = null;
          }
        });
    }

    return this.headerLoad;
  }

  private async readHeaderCacheFromDisk(): Promise<
    Record<string, CachedMangaHeader>
  > {
    try {
      const cached = await AsyncStorage.getItem(OFFLINE_MANGA_HEADER_CACHE_KEY);
      return cached ? JSON.parse(cached) : {};
    } catch (error) {
      logger().error('Storage', 'Failed to get manga header cache', { error });
      return {};
    }
  }

  private chapterListIdentity(
    chapters: CachedMangaDetails['chapters'] | undefined
  ): string {
    if (!chapters?.length) {
      return '';
    }

    return chapters
      .map((chapter) => `${chapter.number}\0${chapter.url ?? ''}`)
      .join('\n');
  }

  private areCachedDetailsEquivalent(
    existing: CachedMangaDetails | undefined,
    next: CachedMangaDetails
  ): boolean {
    if (!existing) {
      return false;
    }

    return (
      existing.title === next.title &&
      existing.alternativeTitle === next.alternativeTitle &&
      existing.status === next.status &&
      existing.description === next.description &&
      existing.published === next.published &&
      existing.rating === next.rating &&
      existing.reviewCount === next.reviewCount &&
      existing.bannerImage === next.bannerImage &&
      existing.totalChapters === next.totalChapters &&
      existing.isBookmarked === next.isBookmarked &&
      this.chapterListIdentity(existing.chapters) ===
      this.chapterListIdentity(next.chapters) &&
      existing.chapterPagination?.hasMore === next.chapterPagination?.hasMore &&
      existing.chapterPagination?.nextPage === next.chapterPagination?.nextPage &&
      existing.chapterPagination?.lastPage === next.chapterPagination?.lastPage &&
      (existing.author?.join('\0') ?? '') === (next.author?.join('\0') ?? '') &&
      (existing.genres?.join('\0') ?? '') === (next.genres?.join('\0') ?? '')
    );
  }

  private async persistHeaderCache(
    cache: Record<string, CachedMangaHeader>
  ): Promise<void> {
    const pruned = pruneMangaHeaderCache(
      cache,
      RECENT_MANGA_HEADER_CACHE_LIMIT
    );
    this.headerMemoryCache = pruned;
    await AsyncStorage.setItem(
      OFFLINE_MANGA_HEADER_CACHE_KEY,
      JSON.stringify(pruned)
    );
  }

  async cacheMangaHeader(
    mangaId: string,
    details: MangaDetails,
    options?: { isBookmarked?: boolean; opened?: boolean }
  ): Promise<void> {
    try {
      const cache = await this.getAllCachedMangaHeaders();
      const existing = cache[mangaId];
      const now = Date.now();
      const incomingHeader = extractMangaHeader(details, mangaId);
      const shouldReplaceDescription = hasLoadedMangaHeader(incomingHeader);
      const resolvedTotalChapters = Math.max(
        incomingHeader.totalChapters && incomingHeader.totalChapters > 0
          ? incomingHeader.totalChapters
          : 0,
        existing?.totalChapters && existing.totalChapters > 0
          ? existing.totalChapters
          : 0
      );

      const nextHeader: CachedMangaHeader = {
        ...(existing ?? incomingHeader),
        ...incomingHeader,
        description: shouldReplaceDescription
          ? incomingHeader.description
          : (existing?.description ?? incomingHeader.description),
        alternativeTitle:
          incomingHeader.alternativeTitle.trim() ||
          existing?.alternativeTitle ||
          '',
        status: incomingHeader.status.trim() || existing?.status || '',
        author:
          incomingHeader.author.length > 0
            ? incomingHeader.author
            : (existing?.author ?? []),
        published: incomingHeader.published.trim() || existing?.published || '',
        genres:
          incomingHeader.genres.length > 0
            ? incomingHeader.genres
            : (existing?.genres ?? []),
        rating: incomingHeader.rating.trim() || existing?.rating || '',
        reviewCount:
          incomingHeader.reviewCount.trim() || existing?.reviewCount || '',
        bannerImage:
          incomingHeader.bannerImage.trim() || existing?.bannerImage || '',
        ...(resolvedTotalChapters > 0
          ? { totalChapters: resolvedTotalChapters }
          : {}),
        cachedAt: now,
        lastOpenedAt: options?.opened ? now : (existing?.lastOpenedAt ?? now),
        isBookmarked: options?.isBookmarked ?? existing?.isBookmarked ?? false,
      };

      cache[mangaId] = nextHeader;
      if (existing && areCachedMangaHeadersEquivalent(existing, nextHeader)) {
        if (!options?.opened) {
          cache[mangaId] = existing;
          this.headerMemoryCache = cache;
          return;
        }

        cache[mangaId] = { ...existing, lastOpenedAt: now };
        await this.persistHeaderCache(cache);
        return;
      }

      await this.persistHeaderCache(cache);

      logger().debug('Storage', 'Cached manga header', {
        mangaId,
        title: nextHeader.title,
        isBookmarked: nextHeader.isBookmarked,
      });
    } catch (error) {
      logger().error('Storage', 'Failed to cache manga header', {
        error,
        mangaId,
      });
    }
  }

  async getCachedMangaHeader(
    mangaId: string
  ): Promise<CachedMangaHeader | null> {
    try {
      const cache = await this.getAllCachedMangaHeaders();
      if (cache[mangaId]) {
        return cache[mangaId];
      }

      const details = await this.getCachedMangaDetails(mangaId);
      if (!details || !hasLoadedMangaHeader(details)) {
        return null;
      }

      return {
        ...extractMangaHeader(details, mangaId),
        cachedAt: details.cachedAt,
        lastOpenedAt: details.cachedAt,
        isBookmarked: details.isBookmarked,
      };
    } catch (error) {
      logger().error('Storage', 'Failed to get cached manga header', {
        error,
        mangaId,
      });
      return null;
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
      this.memoryCache = cache;
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
        this.memoryCache = cache;
        await AsyncStorage.setItem(
          OFFLINE_MANGA_CACHE_KEY,
          JSON.stringify(cache)
        );

        logger().debug('Storage', 'Updated manga bookmark status', {
          mangaId,
          isBookmarked,
        });
      }

      const headers = await this.getAllCachedMangaHeaders();
      if (headers[mangaId]) {
        headers[mangaId] = {
          ...headers[mangaId],
          isBookmarked,
        };
        await this.persistHeaderCache(headers);
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
        AsyncStorage.removeItem(OFFLINE_MANGA_HEADER_CACHE_KEY),
        AsyncStorage.removeItem(OFFLINE_SEARCH_CACHE_KEY),
        AsyncStorage.removeItem(OFFLINE_HOME_CACHE_KEY),
      ]);
      this.memoryCache = null;
      this.headerMemoryCache = null;

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
