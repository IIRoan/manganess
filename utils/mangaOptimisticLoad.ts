import { getMangaData } from '@/services/bookmarkService';
import { offlineCacheService } from '@/services/offlineCacheService';
import type { MangaDetails } from '@/types';
import type { MangaData } from '@/types/manga';

export interface MangaLocalHydration {
  details: MangaDetails | null;
  mangaData: MangaData | null;
  hasInstantDetails: boolean;
  hasCachedChapters: boolean;
}

export interface BookmarkProgressSnapshot {
  readChapters: string[];
  bookmarkStatus: string | null;
  lastReadChapter: string | null;
}

/**
 * Loads manga metadata from local storage (offline cache + bookmark data)
 * for instant display before any network requests complete.
 */
export async function hydrateMangaFromLocal(
  mangaId: string
): Promise<MangaLocalHydration> {
  const [cachedDetails, mangaData] = await Promise.all([
    offlineCacheService.getCachedMangaDetails(mangaId),
    getMangaData(mangaId),
  ]);

  if (cachedDetails) {
    return {
      details: { ...cachedDetails, id: mangaId },
      mangaData,
      hasInstantDetails: true,
      hasCachedChapters: (cachedDetails.chapters?.length ?? 0) > 0,
    };
  }

  if (mangaData) {
    const partialDetails: MangaDetails = {
      id: mangaId,
      title: mangaData.title,
      bannerImage: mangaData.bannerImage,
      chapters: [],
      description: '',
      status: '',
      author: [],
      genres: [],
      published: '',
      rating: '',
      reviewCount: '',
      alternativeTitle: '',
      ...(mangaData.totalChapters != null
        ? { totalChapters: mangaData.totalChapters }
        : {}),
    };

    return {
      details: partialDetails,
      mangaData,
      hasInstantDetails: true,
      hasCachedChapters: false,
    };
  }

  return {
    details: null,
    mangaData: null,
    hasInstantDetails: false,
    hasCachedChapters: false,
  };
}

export function getBookmarkProgressFromMangaData(
  mangaData: MangaData | null
): BookmarkProgressSnapshot {
  if (!mangaData) {
    return { readChapters: [], bookmarkStatus: null, lastReadChapter: null };
  }

  const readChapters = mangaData.readChapters ?? [];
  let lastReadChapter: string | null = null;

  if (mangaData.lastReadChapter) {
    lastReadChapter = `Chapter ${mangaData.lastReadChapter}`;
  } else if (readChapters.length === 0) {
    lastReadChapter = 'Not started';
  }

  return {
    readChapters,
    bookmarkStatus: mangaData.bookmarkStatus,
    lastReadChapter,
  };
}
