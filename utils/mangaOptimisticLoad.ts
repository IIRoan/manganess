import { getMangaData } from '@/services/bookmarkService';
import { offlineCacheService } from '@/services/offlineCacheService';
import type { MangaDetails } from '@/types';
import type { MangaData } from '@/types/manga';
import {
  extractMangaHeader,
  mangaDataToHeader,
  mangaHeaderToDetails,
} from '@/utils/mangaHeader';

export interface MangaLocalHydration {
  details: MangaDetails | null;
  mangaData: MangaData | null;
  hasInstantDetails: boolean;
  hasCachedChapters: boolean;
}

export type MangaLocalDisplayHydration = Pick<
  MangaLocalHydration,
  'details' | 'hasInstantDetails' | 'hasCachedChapters'
>;

export interface BookmarkProgressSnapshot {
  readChapters: string[];
  bookmarkStatus: string | null;
  lastReadChapter: string | null;
}

let inflightHydrations = new Map<string, Promise<MangaLocalHydration>>();
let inflightDisplayHydrations = new Map<
  string,
  Promise<MangaLocalDisplayHydration>
>();

export function resetHydrateMangaFromLocalForTests(): void {
  inflightHydrations = new Map();
  inflightDisplayHydrations = new Map();
}

export function firstRouteParam(
  value: string | string[] | undefined
): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return '';
}

export function hasTrustedMangaRoutePreview(
  id: string | string[] | undefined,
  previewId: string | string[] | undefined,
  title: string | string[] | undefined,
  imageUrl: string | string[] | undefined
): boolean {
  const mangaId = firstRouteParam(id);
  return (
    mangaId.length > 0 &&
    firstRouteParam(previewId) === mangaId &&
    Boolean(firstRouteParam(title) || firstRouteParam(imageUrl))
  );
}

export function mangaRoutePreviewDetails(
  id: string,
  title: string | string[] | undefined,
  imageUrl: string | string[] | undefined
): MangaDetails {
  return {
    id,
    title: firstRouteParam(title),
    alternativeTitle: '',
    status: '',
    description: '',
    author: [],
    published: '',
    genres: [],
    rating: '',
    reviewCount: '',
    bannerImage: firstRouteParam(imageUrl),
    chapters: [],
  };
}

/**
 * Loads manga metadata from local storage (offline cache + bookmark data)
 * for instant display before any network requests complete.
 */
export async function hydrateMangaFromLocal(
  mangaId: string
): Promise<MangaLocalHydration> {
  const existing = inflightHydrations.get(mangaId);
  if (existing) {
    return existing;
  }

  const pending = loadMangaFromLocal(mangaId).finally(() => {
    if (inflightHydrations.get(mangaId) === pending) {
      inflightHydrations.delete(mangaId);
    }
  });
  inflightHydrations.set(mangaId, pending);
  return pending;
}

/**
 * Loads only the data needed to paint the detail header. Bookmark progress is
 * deliberately excluded because its AsyncStorage read can be much slower and
 * must not hold cached display content behind it.
 */
export async function hydrateMangaDisplayFromLocal(
  mangaId: string
): Promise<MangaLocalDisplayHydration> {
  const existing = inflightDisplayHydrations.get(mangaId);
  if (existing) {
    return existing;
  }

  const pending = loadMangaDisplayFromLocal(mangaId).finally(() => {
    if (inflightDisplayHydrations.get(mangaId) === pending) {
      inflightDisplayHydrations.delete(mangaId);
    }
  });
  inflightDisplayHydrations.set(mangaId, pending);
  return pending;
}

async function loadMangaDisplayFromLocal(
  mangaId: string
): Promise<MangaLocalDisplayHydration> {
  const [cachedDetails, cachedHeader] = await Promise.all([
    offlineCacheService.getCachedMangaDetails(mangaId),
    offlineCacheService.getCachedMangaHeader(mangaId),
  ]);

  const header =
    cachedHeader ??
    (cachedDetails ? extractMangaHeader(cachedDetails, mangaId) : null);
  const cachedChapters = cachedDetails?.chapters ?? [];

  if (!header || (!header.title.trim() && !header.description.trim())) {
    return {
      details: null,
      hasInstantDetails: false,
      hasCachedChapters: cachedChapters.length > 0,
    };
  }

  const details = mangaHeaderToDetails(header, []);
  if (typeof cachedDetails?.totalChapters === 'number') {
    details.totalChapters = Math.max(
      details.totalChapters ?? 0,
      cachedDetails.totalChapters
    );
  }

  return {
    details: { ...details, id: mangaId },
    hasInstantDetails: true,
    hasCachedChapters: cachedChapters.length > 0,
  };
}

async function loadMangaFromLocal(
  mangaId: string
): Promise<MangaLocalHydration> {
  const [displayHydration, cachedDetails, mangaData] = await Promise.all([
    hydrateMangaDisplayFromLocal(mangaId),
    offlineCacheService.getCachedMangaDetails(mangaId),
    getMangaData(mangaId),
  ]);

  const header =
    (displayHydration.details
      ? extractMangaHeader(displayHydration.details, mangaId)
      : null) ?? mangaDataToHeader(mangaData);
  const cachedChapters = cachedDetails?.chapters ?? [];

  if (header && (header.title.trim() || header.description.trim())) {
    const details = mangaHeaderToDetails(header, cachedChapters);
    if (typeof cachedDetails?.totalChapters === 'number') {
      details.totalChapters = Math.max(
        details.totalChapters ?? 0,
        cachedDetails.totalChapters
      );
    }

    return {
      details: { ...details, id: mangaId },
      mangaData,
      hasInstantDetails: true,
      hasCachedChapters: cachedChapters.length > 0,
    };
  }

  return {
    details: null,
    mangaData,
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
