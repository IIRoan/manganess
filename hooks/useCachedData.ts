import { useAtomInstance } from '@zedux/react';
import { offlineCacheAtom } from '@/atoms/offlineCacheAtom';
import { MangaDetails, MangaItem } from '@/types';

/**
 * Hook providing access to the offline cache atom's manipulation functions.
 *
 * Maintains the same API surface as offlineCacheService for drop-in compatibility.
 */
export const useCachedData = () => {
  const instance = useAtomInstance(offlineCacheAtom);

  return {
    cacheMangaDetails: instance.exports.cacheMangaDetails as (
      mangaId: string,
      details: MangaDetails,
      isBookmarked?: boolean
    ) => Promise<void>,

    getCachedMangaDetails: instance.exports.getCachedMangaDetails as (
      mangaId: string
    ) => (MangaDetails & { isBookmarked?: boolean; cachedAt?: number }) | null,

    cacheSearchResults: instance.exports.cacheSearchResults as (
      query: string,
      results: MangaItem[]
    ) => Promise<void>,

    getCachedSearchResults: instance.exports.getCachedSearchResults as (
      query: string
    ) => { query: string; results: MangaItem[] } | null,

    cacheHomeData: instance.exports.cacheHomeData as (
      mostViewed: MangaItem[],
      newReleases: MangaItem[],
      featuredManga: MangaItem | null
    ) => Promise<void>,

    getCachedHomeData: instance.exports.getCachedHomeData as () => {
      mostViewed: MangaItem[];
      newReleases: MangaItem[];
      featuredManga: MangaItem | null;
      cachedAt: number;
    } | null,

    updateMangaBookmarkStatus: instance.exports.updateMangaBookmarkStatus as (
      mangaId: string,
      isBookmarked: boolean
    ) => Promise<void>,

    removeMangaFromCache: instance.exports.removeMangaFromCache as (
      mangaId: string
    ) => Promise<void>,

    getBookmarkedMangaDetails: instance.exports
      .getBookmarkedMangaDetails as () => Array<
      MangaDetails & { isBookmarked?: boolean; cachedAt?: number }
    >,

    clearAllCache: instance.exports.clearAllCache as () => Promise<void>,

    getCacheStats: instance.exports.getCacheStats as () => {
      mangaCount: number;
      bookmarkedCount: number;
      searchQueriesCount: number;
      hasHomeData: boolean;
    },

    cleanExpiredEntries: instance.exports
      .cleanExpiredEntries as () => Promise<void>,
  };
};
