import type { MangaDetails, MangaItem } from '@/types/manga';

/**
 * A manga provider besides the default MangaFire backend.
 *
 * Its manga ids are namespaced as `<source id>~<key>` (see `sourceMangaId`), so
 * bookmarks, downloads, caches and routes that key off the manga id work unchanged.
 * Un-namespaced ids always belong to MangaFire.
 */
export interface MangaSource {
  /** Lowercase [a-z0-9] — becomes the manga id prefix. Never change it once shipped. */
  id: string;
  /** Display name. */
  name: string;
  /** Host shown in Settings, e.g. `azuki.com`. */
  website: string;
  /** Titles matching `query`. Ids must be namespaced via `sourceMangaId`. */
  search(query: string): Promise<MangaItem[]>;
  /** Details plus the full chapter list. `id` must be the namespaced manga id. */
  fetchDetails(key: string): Promise<MangaDetails>;
  /** Page image URLs in reading order. */
  fetchChapterPages(key: string, chapterNumber: string): Promise<string[]>;
}

export const SOURCE_ID_SEPARATOR = '~';

export function sourceMangaId(sourceId: string, key: string): string {
  return `${sourceId}${SOURCE_ID_SEPARATOR}${key}`;
}

/** True for any namespaced id, even one whose source is no longer registered. */
export function isSourceMangaId(mangaId: string): boolean {
  return mangaId.trim().indexOf(SOURCE_ID_SEPARATOR) > 0;
}
