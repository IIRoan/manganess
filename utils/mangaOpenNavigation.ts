import {
  fetchTitleDetails,
  mapApiTitleToMangaDetails,
} from '@/services/mangaFireApi';
import { startMangaOpen } from '@/services/mangaOpenTrace';
import type { MangaDetails } from '@/types';
import { hydrateMangaDisplayFromLocal } from '@/utils/mangaOptimisticLoad';

export interface MangaOpenTarget {
  id: string;
  title?: string;
  imageUrl?: string;
  banner?: string;
  bannerImage?: string;
}

type MangaOpenRouter = {
  push: (href: {
    pathname: '/manga/[id]';
    params: {
      id: string;
      title: string;
      imageUrl: string;
      previewId: string;
    };
  }) => void;
};

export function mangaOpenRouteParams(item: MangaOpenTarget): {
  id: string;
  title: string;
  imageUrl: string;
  previewId: string;
} {
  return {
    id: item.id,
    title: item.title ?? '',
    imageUrl: item.imageUrl || item.banner || item.bannerImage || '',
    previewId: item.id,
  };
}

export function prefetchMangaOpen(mangaId: string): void {
  const id = mangaId.trim();
  if (!id) {
    return;
  }

  void hydrateMangaDisplayFromLocal(id);
}

/**
 * Maps title metadata into renderable header data for direct routes that do not
 * already carry a card/search preview.
 */
export async function loadMangaOpenHeader(
  mangaId: string
): Promise<MangaDetails | null> {
  const id = mangaId.trim();
  if (!id) {
    return null;
  }

  // This is opportunistic enrichment: route metadata already paints the page,
  // so a challenged title endpoint must not occupy the request queue with retries.
  const title = await fetchTitleDetails(id, { retry: false });
  return mapApiTitleToMangaDetails(title, []);
}

export function navigateToMangaDetails(
  router: MangaOpenRouter,
  item: MangaOpenTarget,
  source: string
): void {
  const id = item.id.trim();
  if (!id) {
    return;
  }

  startMangaOpen(id, source);
  prefetchMangaOpen(id);
  router.push({
    pathname: '/manga/[id]',
    params: mangaOpenRouteParams({ ...item, id }),
  });
}
