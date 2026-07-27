import type { MangaDetails } from '@/types/manga';

export function mergeMangaDetailsRefresh(
  previous: MangaDetails | null,
  incoming: Omit<MangaDetails, 'id'> & { id?: string },
  mangaId: string
): MangaDetails {
  const incomingChapters = incoming.chapters ?? [];
  const previousChapters = previous?.chapters ?? [];
  const preferPreviousChapters =
    previousChapters.length > incomingChapters.length;
  const chapters = preferPreviousChapters ? previousChapters : incomingChapters;

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
