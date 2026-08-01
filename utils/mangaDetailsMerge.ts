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

  return {
    ...incoming,
    id: mangaId,
    chapters,
    ...(mergedTotal > 0 ? { totalChapters: mergedTotal } : {}),
  };
}
