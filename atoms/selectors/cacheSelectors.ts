import { useAtomInstance } from '@zedux/react';
import { offlineCacheAtom } from '@/atoms/offlineCacheAtom';
import { MangaDetails, MangaItem } from '@/types';

/**
 * Selector: returns cached manga details for a given mangaId.
 * Returns null if not cached or expired (when online).
 */
export const useCachedMangaDetails = (
  mangaId: string
): (MangaDetails & { isBookmarked?: boolean; cachedAt?: number }) | null => {
  const instance = useAtomInstance(offlineCacheAtom);
  return instance.exports.getCachedMangaDetails(mangaId);
};

/**
 * Selector: returns cached search results for a given query.
 * Returns null if not cached or expired (when online).
 */
export const useCachedSearchResults = (
  query: string
): { query: string; results: MangaItem[] } | null => {
  const instance = useAtomInstance(offlineCacheAtom);
  return instance.exports.getCachedSearchResults(query);
};

/**
 * Selector: returns cached home data.
 * Returns null if not cached or expired (when online).
 */
export const useCachedHomeData = (): {
  mostViewed: MangaItem[];
  newReleases: MangaItem[];
  featuredManga: MangaItem | null;
  cachedAt: number;
} | null => {
  const instance = useAtomInstance(offlineCacheAtom);
  return instance.exports.getCachedHomeData();
};
