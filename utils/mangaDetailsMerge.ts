import type { Chapter, MangaDetails } from '@/types/manga';

function chapterKey(number: string | undefined): string {
  return String(number ?? '').trim();
}

/**
 * Keep a longer cached chapter list, but overwrite URLs/titles for chapters
 * present in the fresh page so stale MangaFire chapter API IDs heal.
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

  if (incomingChapters.length >= previousChapters.length) {
    return incomingChapters;
  }

  const incomingByNumber = new Map<string, Chapter>();
  for (const chapter of incomingChapters) {
    const key = chapterKey(chapter.number);
    if (key) {
      incomingByNumber.set(key, chapter);
    }
  }

  return previousChapters.map((chapter) => {
    const key = chapterKey(chapter.number);
    const fresh = key ? incomingByNumber.get(key) : undefined;
    if (!fresh) {
      return chapter;
    }
    if (fresh.url === chapter.url && fresh.title === chapter.title) {
      return chapter;
    }
    return {
      ...chapter,
      url: fresh.url || chapter.url,
      title: fresh.title || chapter.title,
      date: fresh.date || chapter.date,
    };
  });
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
