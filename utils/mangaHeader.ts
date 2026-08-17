import { RECENT_MANGA_HEADER_CACHE_LIMIT } from '@/constants/mangaCache';
import type {
  MangaData,
  MangaDetails,
  MangaHeaderSnapshot,
} from '@/types/manga';

export interface CachedMangaHeader extends MangaHeaderSnapshot {
  cachedAt: number;
  lastOpenedAt: number;
  isBookmarked: boolean;
}

export function hasLoadedMangaHeader(
  details:
    | Pick<MangaHeaderSnapshot, 'description'>
    | Pick<MangaDetails, 'description'>
    | null
    | undefined
): boolean {
  return Boolean(details?.description?.trim());
}

function sameStringList(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined
): boolean {
  const first = left ?? [];
  const second = right ?? [];
  if (first.length !== second.length) {
    return false;
  }
  return first.every((value, index) => value === second[index]);
}

/** Compare header payloads while ignoring open timestamps. */
export function areCachedMangaHeadersEquivalent(
  left: CachedMangaHeader | null | undefined,
  right: CachedMangaHeader | null | undefined
): boolean {
  if (!left || !right) {
    return false;
  }

  return (
    left.id === right.id &&
    left.title === right.title &&
    left.alternativeTitle === right.alternativeTitle &&
    left.status === right.status &&
    left.description === right.description &&
    sameStringList(left.author, right.author) &&
    left.published === right.published &&
    sameStringList(left.genres, right.genres) &&
    left.rating === right.rating &&
    left.reviewCount === right.reviewCount &&
    left.bannerImage === right.bannerImage &&
    left.totalChapters === right.totalChapters &&
    left.type === right.type &&
    left.isBookmarked === right.isBookmarked
  );
}

export function extractMangaHeader(
  details: Pick<
    MangaDetails,
    | 'id'
    | 'title'
    | 'alternativeTitle'
    | 'status'
    | 'description'
    | 'author'
    | 'published'
    | 'genres'
    | 'rating'
    | 'reviewCount'
    | 'bannerImage'
    | 'totalChapters'
    | 'type'
  > & { id?: string },
  mangaId: string
): MangaHeaderSnapshot {
  return {
    id: mangaId,
    title: details.title ?? '',
    alternativeTitle: details.alternativeTitle ?? '',
    status: details.status ?? '',
    description: details.description ?? '',
    author: details.author ?? [],
    published: details.published ?? '',
    genres: details.genres ?? [],
    rating: details.rating ?? '',
    reviewCount: details.reviewCount ?? '',
    bannerImage: details.bannerImage ?? '',
    ...(typeof details.totalChapters === 'number' && details.totalChapters > 0
      ? { totalChapters: details.totalChapters }
      : {}),
    ...(details.type ? { type: details.type } : {}),
  };
}

export function mangaHeaderToDetails(
  header: MangaHeaderSnapshot,
  chapters: MangaDetails['chapters'] = []
): MangaDetails {
  return {
    ...header,
    chapters,
  };
}

export function mangaDataToHeader(
  mangaData: MangaData | null
): MangaHeaderSnapshot | null {
  if (!mangaData) {
    return null;
  }

  return {
    id: mangaData.id,
    title: mangaData.title,
    alternativeTitle: mangaData.alternativeTitle ?? '',
    status: mangaData.status ?? '',
    description: mangaData.description ?? '',
    author: mangaData.author ?? [],
    published: mangaData.published ?? '',
    genres: mangaData.genres ?? [],
    rating: mangaData.rating ?? '',
    reviewCount: mangaData.reviewCount ?? '',
    bannerImage: mangaData.bannerImage,
    ...(typeof mangaData.totalChapters === 'number' &&
      mangaData.totalChapters > 0
      ? { totalChapters: mangaData.totalChapters }
      : {}),
    ...(mangaData.type ? { type: mangaData.type } : {}),
  };
}

export function applyHeaderToMangaData(
  existing: MangaData,
  details: MangaHeaderSnapshot
): MangaData {
  const nextDescription = details.description?.trim() || existing.description;
  const nextAlternativeTitle =
    details.alternativeTitle?.trim() || existing.alternativeTitle;
  const nextStatus = details.status?.trim() || existing.status;
  const nextAuthor =
    details.author?.length > 0 ? details.author : existing.author;
  const nextPublished = details.published?.trim() || existing.published;
  const nextGenres =
    details.genres?.length > 0 ? details.genres : existing.genres;
  const nextRating = details.rating?.trim() || existing.rating;
  const nextReviewCount = details.reviewCount?.trim() || existing.reviewCount;

  return {
    ...existing,
    title: details.title?.trim() || existing.title,
    bannerImage: details.bannerImage?.trim() || existing.bannerImage,
    ...(nextDescription ? { description: nextDescription } : {}),
    ...(nextAlternativeTitle ? { alternativeTitle: nextAlternativeTitle } : {}),
    ...(nextStatus ? { status: nextStatus } : {}),
    ...(nextAuthor ? { author: nextAuthor } : {}),
    ...(nextPublished ? { published: nextPublished } : {}),
    ...(nextGenres ? { genres: nextGenres } : {}),
    ...(nextRating ? { rating: nextRating } : {}),
    ...(nextReviewCount ? { reviewCount: nextReviewCount } : {}),
    ...(details.type ? { type: details.type } : {}),
    ...(typeof details.totalChapters === 'number' && details.totalChapters > 0
      ? {
        totalChapters: Math.max(
          details.totalChapters,
          existing.totalChapters ?? 0
        ),
      }
      : {}),
    lastUpdated: Date.now(),
  };
}

export function pruneMangaHeaderCache(
  cache: Record<string, CachedMangaHeader>,
  maxRecent: number = RECENT_MANGA_HEADER_CACHE_LIMIT
): Record<string, CachedMangaHeader> {
  const bookmarked: Array<[string, CachedMangaHeader]> = [];
  const recent: Array<[string, CachedMangaHeader]> = [];

  for (const entry of Object.entries(cache)) {
    if (entry[1].isBookmarked) {
      bookmarked.push(entry);
    } else {
      recent.push(entry);
    }
  }

  if (recent.length <= maxRecent) {
    return cache;
  }

  recent.sort((left, right) => right[1].lastOpenedAt - left[1].lastOpenedAt);
  return Object.fromEntries([...bookmarked, ...recent.slice(0, maxRecent)]);
}
