import type { Chapter, MangaDetails } from '@/types/manga';
import { getOldestChapterNumber } from '@/utils/chapterListPagination';

function chapterKey(number: string | undefined): string {
  return String(number ?? '').trim();
}

function mergeIncomingOverPrevious(
  previousChapters: Chapter[],
  incomingChapters: Chapter[]
): Chapter[] {
  const previousKeys = new Set<string>();
  for (const chapter of previousChapters) {
    const key = chapterKey(chapter.number);
    if (key) {
      previousKeys.add(key);
    }
  }

  const incomingByNumber = new Map<string, Chapter>();
  const brandNew: Chapter[] = [];
  for (const chapter of incomingChapters) {
    const key = chapterKey(chapter.number);
    if (!key) {
      continue;
    }
    incomingByNumber.set(key, chapter);
    if (!previousKeys.has(key)) {
      brandNew.push(chapter);
    }
  }

  const updatedPrevious = previousChapters.map((chapter) => {
    const key = chapterKey(chapter.number);
    const fresh = key ? incomingByNumber.get(key) : undefined;
    if (!fresh) {
      return chapter;
    }
    if (
      fresh.url === chapter.url &&
      fresh.title === chapter.title &&
      fresh.date === chapter.date &&
      fresh.sourceType === chapter.sourceType
    ) {
      return chapter;
    }
    return {
      ...chapter,
      url: fresh.url || chapter.url,
      title: fresh.title || chapter.title,
      date: fresh.date || chapter.date,
      ...(fresh.sourceType ? { sourceType: fresh.sourceType } : {}),
    };
  });

  return brandNew.length ? [...brandNew, ...updatedPrevious] : updatedPrevious;
}

/**
 * Keep a longer cached chapter list, but overwrite URLs/titles for chapters
 * present in the fresh page so stale MangaFire chapter API IDs heal.
 * Also prepend brand-new newest chapters from a shorter page-1 refresh
 * (e.g. One Piece 1191 published while cache still ends at 1190).
 *
 * Never let a longer page-1 window (40–90) replace a shorter list that still
 * contains early chapters (1–30).
 */
export function mergeChapterListsPreferringLonger(
  previousChapters: Chapter[],
  incomingChapters: Chapter[]
): Chapter[] {
  if (!previousChapters.length) {
    return incomingChapters;
  }
  if (!incomingChapters.length) {
    return previousChapters;
  }

  if (incomingChapters.length > previousChapters.length) {
    const previousOldest = getOldestChapterNumber(previousChapters);
    const incomingOldest = getOldestChapterNumber(incomingChapters);
    // Incoming is longer and reaches at least as far back — prefer it.
    if (
      previousOldest == null ||
      incomingOldest == null ||
      incomingOldest <= previousOldest + 0.001
    ) {
      return incomingChapters;
    }

    // Longer newest-first page must not wipe older chapters only in cache.
    const incomingKeys = new Set(
      incomingChapters
        .map((chapter) => chapterKey(chapter.number))
        .filter(Boolean)
    );
    const previousOnly = previousChapters.filter((chapter) => {
      const key = chapterKey(chapter.number);
      return key.length > 0 && !incomingKeys.has(key);
    });
    return previousOnly.length
      ? [...incomingChapters, ...previousOnly]
      : incomingChapters;
  }

  return mergeIncomingOverPrevious(previousChapters, incomingChapters);
}

export function mergeMangaDetailsRefresh(
  previous: MangaDetails | null,
  incoming: Omit<MangaDetails, 'id'> & { id?: string },
  mangaId: string
): MangaDetails {
  const incomingChapters = incoming.chapters ?? [];
  const previousChapters = previous?.chapters ?? [];
  const chapters = mergeChapterListsPreferringLonger(
    previousChapters,
    incomingChapters
  );

  const mergedTotal = Math.max(
    previous?.totalChapters ?? 0,
    incoming.totalChapters ?? 0,
    chapters.length
  );

  const incomingAuthors = incoming.author ?? [];
  const incomingGenres = incoming.genres ?? [];

  return {
    ...incoming,
    id: mangaId,
    title: incoming.title?.trim() || previous?.title || incoming.title,
    alternativeTitle:
      incoming.alternativeTitle?.trim() || previous?.alternativeTitle || '',
    status: incoming.status?.trim() || previous?.status || incoming.status,
    description:
      incoming.description?.trim() ||
      previous?.description ||
      incoming.description,
    author:
      incomingAuthors.length > 0 ? incomingAuthors : (previous?.author ?? []),
    published:
      incoming.published?.trim() || previous?.published || incoming.published,
    genres:
      incomingGenres.length > 0 ? incomingGenres : (previous?.genres ?? []),
    rating: incoming.rating?.trim() || previous?.rating || incoming.rating,
    reviewCount:
      incoming.reviewCount?.trim() ||
      previous?.reviewCount ||
      incoming.reviewCount,
    bannerImage:
      incoming.bannerImage?.trim() ||
      previous?.bannerImage ||
      incoming.bannerImage,
    chapters,
    ...(mergedTotal > 0 ? { totalChapters: mergedTotal } : {}),
  };
}
