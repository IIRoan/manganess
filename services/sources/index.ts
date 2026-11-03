import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MangaItem } from '@/types/manga';
import { logger } from '@/utils/logger';
import { azukiSource } from './azuki';
import { SOURCE_ID_SEPARATOR, type MangaSource } from './types';

export * from './types';

/**
 * Extra manga sources, keyed by id. MangaFire stays the default for
 * un-namespaced ids and is not listed here.
 *
 * Adding a source: implement `MangaSource` in `services/sources/<name>.ts` and
 * register it below (or call `registerSource` at runtime). Search, details,
 * the reader, downloads and the Settings > Sources list pick it up by manga id
 * automatically.
 */
const sources = new Map<string, MangaSource>();

export function registerSource(source: MangaSource): void {
  if (!/^[a-z0-9]+$/.test(source.id)) {
    throw new Error(`Invalid manga source id: ${source.id}`);
  }
  sources.set(source.id, source);
}

registerSource(azukiSource);

export function getSources(): MangaSource[] {
  return [...sources.values()];
}

/** Source + series key for a namespaced id; null for MangaFire ids. */
export function resolveSourceManga(
  mangaId: string
): { source: MangaSource; key: string } | null {
  const id = mangaId.trim();
  const separator = id.indexOf(SOURCE_ID_SEPARATOR);
  if (separator <= 0) {
    return null;
  }
  const source = sources.get(id.slice(0, separator));
  return source ? { source, key: id.slice(separator + 1) } : null;
}

const DISABLED_SOURCES_KEY = 'disabled_manga_sources';

/** Sources the user turned off in Settings. They are skipped in search only. */
export async function getDisabledSourceIds(): Promise<string[]> {
  try {
    const ids = JSON.parse(
      (await AsyncStorage.getItem(DISABLED_SOURCES_KEY)) ?? '[]'
    );
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export async function setSourceEnabled(
  sourceId: string,
  enabled: boolean
): Promise<void> {
  const disabled = new Set(await getDisabledSourceIds());
  if (enabled) {
    disabled.delete(sourceId);
  } else {
    disabled.add(sourceId);
  }
  await AsyncStorage.setItem(DISABLED_SOURCES_KEY, JSON.stringify([...disabled]));
}

/** Searches every enabled source. One failing source never hides the others. */
export async function searchSources(query: string): Promise<MangaItem[]> {
  const disabled = await getDisabledSourceIds();
  const active = getSources().filter((source) => !disabled.includes(source.id));
  const results = await Promise.allSettled(
    active.map((source) => source.search(query))
  );

  return results.flatMap((result, index) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    logger().warn('Service', 'Manga source search failed', {
      source: active[index]?.id,
      error:
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason),
    });
    return [];
  });
}
