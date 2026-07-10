import AsyncStorage from '@react-native-async-storage/async-storage';
import { searchTitles, titleExists, fetchTitleDetailsIfExists } from '@/services/mangaFireApi';
import {
  getMangaData,
  replaceBookmark,
  setMangaData,
  removeBookmarkKeyFromIndex,
} from '@/services/bookmarkService';
import { getLastReadManga, setLastReadManga } from '@/services/readChapterService';
import { offlineCacheService } from '@/services/offlineCacheService';
import { logger } from '@/utils/logger';
import type { MangaItem } from '@/types/manga';

const MIGRATION_ATTEMPT_KEY = 'manga_id_migration_attempts';
const AUTO_MATCH_THRESHOLD = 85;

export type MigrationPhase = 'checking' | 'migrating' | 'manual';

export interface MigrationProgress {
  phase: MigrationPhase;
  title: string;
  message: string;
}

export type LegacyMangaResolutionResult =
  | { status: 'resolved'; newId: string; title: string; bannerImage: string }
  | { status: 'not_found'; hintTitle?: string }
  | { status: 'ambiguous'; hintTitle?: string };

export type AttemptLegacyMigrationResult =
  | { outcome: 'not_needed' }
  | { outcome: 'migrated'; newId: string }
  | { outcome: 'manual'; legacyId: string; hintTitle?: string }
  | { outcome: 'skipped' };

export const MIGRATION_MESSAGES = {
  checking: {
    title: 'Updating manga link',
    message:
      'MangaFire recently changed how manga links work. We are looking up the new link for this title and will move your saved progress over automatically.',
  },
  migrating: {
    title: 'Match found',
    message:
      'We found this manga on the updated site. Your bookmarks and reading progress are being moved to the new link now.',
  },
  manual: {
    title: 'Manual lookup needed',
    message:
      'We could not find a confident match for this manga on the updated MangaFire site. Search for the title manually and we can move your saved bookmark progress to the correct entry.',
  },
} as const;

/**
 * New MangaFire IDs are short alphanumeric handles (for example `92kk8`).
 * Legacy bookmarks often used slug-style IDs such as `one-piece`.
 */
export function isLikelyLegacyMangaId(id: string): boolean {
  const trimmed = id.trim();
  if (!trimmed) {
    return false;
  }

  if (trimmed.includes('-') || trimmed.includes('_')) {
    return true;
  }

  if (!/^[a-z0-9]+$/i.test(trimmed)) {
    return true;
  }

  return trimmed.length > 8;
}

export function extractSlugFromMangaLink(link: string): string | null {
  const match = link.match(/\/title\/([^./?#]+)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Old bookmarks sometimes stored composite IDs like `tougen-ankii.37z1y`
 * where the API now expects only the short `hid` (`37z1y`).
 */
export function extractHidFromCompositeId(id: string): string | null {
  const trimmed = id.trim();
  const match = trimmed.match(/^.+\.([a-z0-9]{4,8})$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

/**
 * Returns the slug portion from slug-style or composite legacy IDs.
 */
export function extractSlugFromLegacyId(id: string): string | null {
  const trimmed = id.trim();
  if (!trimmed) {
    return null;
  }

  const compositeSlug = extractHidFromCompositeId(trimmed);
  if (compositeSlug) {
    const slug = trimmed.slice(0, -(compositeSlug.length + 1)).toLowerCase();
    return slug || null;
  }

  if (trimmed.includes('-') || trimmed.includes('_')) {
    return trimmed.toLowerCase();
  }

  return null;
}

export type StoredMangaIdResolution =
  | {
      action: 'use_current';
      id: string;
      title: string;
      bannerImage: string;
    }
  | {
      action: 'remap';
      fromId: string;
      toId: string;
      title: string;
      bannerImage: string;
    }
  | {
      action: 'local_only';
      id: string;
    };

function posterFromTitleDetails(
  title: NonNullable<Awaited<ReturnType<typeof fetchTitleDetailsIfExists>>>
): string {
  return (
    title.poster?.large || title.poster?.medium || title.poster?.small || ''
  );
}

function resolutionFromDetails(
  details: NonNullable<Awaited<ReturnType<typeof fetchTitleDetailsIfExists>>>,
  storedId: string,
  resolvedId: string
): StoredMangaIdResolution {
  const bannerImage = posterFromTitleDetails(details);
  if (resolvedId === storedId) {
    return {
      action: 'use_current',
      id: resolvedId,
      title: details.title,
      bannerImage,
    };
  }

  return {
    action: 'remap',
    fromId: storedId,
    toId: resolvedId,
    title: details.title,
    bannerImage,
  };
}

export async function resolveStoredMangaId(
  storedId: string,
  hintTitle?: string
): Promise<StoredMangaIdResolution> {
  const normalizedId = storedId.trim();
  if (!normalizedId) {
    return { action: 'local_only', id: normalizedId };
  }

  const log = logger();
  const hidCandidate = extractHidFromCompositeId(normalizedId);
  const isComposite = Boolean(
    hidCandidate && hidCandidate !== normalizedId
  );

  const lookupIds = isComposite && hidCandidate
    ? [hidCandidate]
    : [normalizedId];

  for (const candidateId of lookupIds) {
    try {
      const details = await fetchTitleDetailsIfExists(candidateId);
      if (details) {
        return resolutionFromDetails(details, normalizedId, candidateId);
      }
    } catch (error) {
      log.warn('Service', 'Stored manga ID lookup failed', {
        storedId: normalizedId,
        candidateId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const legacyLookupId =
    extractSlugFromLegacyId(normalizedId) || normalizedId;
  const legacyResolution = await resolveLegacyMangaId(
    legacyLookupId,
    hintTitle
  );

  if (legacyResolution.status === 'resolved') {
    return {
      action: 'remap',
      fromId: normalizedId,
      toId: legacyResolution.newId,
      title: legacyResolution.title,
      bannerImage: legacyResolution.bannerImage,
    };
  }

  return { action: 'local_only', id: normalizedId };
}

function scoreLegacyMatch(
  item: MangaItem,
  legacyId: string,
  hintTitle?: string
): number {
  const legacySlug =
    extractSlugFromLegacyId(legacyId) || legacyId.toLowerCase().trim();
  const legacyHid = extractHidFromCompositeId(legacyId);
  const slug = extractSlugFromMangaLink(item.link);
  const normalizedLegacyTitle = legacySlug.replace(/-/g, ' ').trim();

  if (legacyHid && item.id.toLowerCase() === legacyHid) {
    return 100;
  }

  if (slug === legacySlug) {
    return 100;
  }

  if (item.link.toLowerCase().includes(`/title/${legacySlug}`)) {
    return 95;
  }

  if (hintTitle && item.title.toLowerCase() === hintTitle.toLowerCase()) {
    return 90;
  }

  if (item.title.toLowerCase() === normalizedLegacyTitle) {
    return 85;
  }

  if (hintTitle && item.title.toLowerCase().includes(hintTitle.toLowerCase())) {
    return 70;
  }

  return 0;
}

export async function resolveLegacyMangaId(
  legacyId: string,
  hintTitle?: string
): Promise<LegacyMangaResolutionResult> {
  const log = logger();
  const normalizedLegacyId = legacyId.trim();
  const searchTerms = Array.from(
    new Set(
      [
        extractSlugFromLegacyId(normalizedLegacyId)?.replace(/-/g, ' '),
        normalizedLegacyId.replace(/-/g, ' '),
        hintTitle?.trim(),
        normalizedLegacyId,
      ].filter((value): value is string => Boolean(value))
    )
  );

  const matches = new Map<string, { item: MangaItem; score: number }>();

  for (const keyword of searchTerms) {
    try {
      const results = await searchTitles(keyword, 40);
      for (const item of results) {
        const score = scoreLegacyMatch(item, normalizedLegacyId, hintTitle);
        if (score <= 0) {
          continue;
        }

        const existing = matches.get(item.id);
        if (!existing || score > existing.score) {
          matches.set(item.id, { item, score });
        }
      }
    } catch (error) {
      log.warn('Service', 'Legacy manga search failed', {
        legacyId: normalizedLegacyId,
        keyword,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const rankedMatches = Array.from(matches.values()).sort(
    (left, right) => right.score - left.score
  );

  if (rankedMatches.length === 0) {
    return { status: 'not_found', ...(hintTitle ? { hintTitle } : {}) };
  }

  const bestMatch = rankedMatches[0];
  if (!bestMatch || bestMatch.score < AUTO_MATCH_THRESHOLD) {
    return { status: 'not_found', ...(hintTitle ? { hintTitle } : {}) };
  }

  const strongMatches = rankedMatches.filter(
    (match) => match.score >= AUTO_MATCH_THRESHOLD
  );

  if (strongMatches.length > 1) {
    return { status: 'ambiguous', ...(hintTitle ? { hintTitle } : {}) };
  }

  return {
    status: 'resolved',
    newId: bestMatch.item.id,
    title: bestMatch.item.title,
    bannerImage: bestMatch.item.banner || bestMatch.item.imageUrl,
  };
}

async function readMigrationAttempts(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(MIGRATION_ATTEMPT_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch (error) {
    logger().warn('Storage', 'Failed to read manga migration attempts', {
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
}

export async function hasAttemptedLegacyMigration(
  legacyId: string
): Promise<boolean> {
  const attempts = await readMigrationAttempts();
  return Boolean(attempts[legacyId.trim()]);
}

export async function markLegacyMigrationAttempted(
  legacyId: string
): Promise<void> {
  const normalizedId = legacyId.trim();
  const attempts = await readMigrationAttempts();
  attempts[normalizedId] = true;
  await AsyncStorage.setItem(MIGRATION_ATTEMPT_KEY, JSON.stringify(attempts));
}

export async function shouldAttemptLegacyMigration(
  legacyId: string
): Promise<boolean> {
  const normalizedId = legacyId.trim();
  if (!normalizedId) {
    return false;
  }

  if (await hasAttemptedLegacyMigration(normalizedId)) {
    return false;
  }

  if (await titleExists(normalizedId)) {
    return false;
  }

  const storedManga = await getMangaData(normalizedId);
  return isLikelyLegacyMangaId(normalizedId) || Boolean(storedManga);
}

export async function portLegacyMangaToNewId(
  legacyId: string,
  target: {
    newId: string;
    title: string;
    bannerImage: string;
    totalChapters?: number;
  }
): Promise<void> {
  const normalizedLegacyId = legacyId.trim();
  const normalizedTargetId = target.newId.trim();

  if (!normalizedLegacyId || !normalizedTargetId) {
    throw new Error('Both legacy and target manga IDs are required');
  }

  if (normalizedLegacyId === normalizedTargetId) {
    return;
  }

  const sourceManga = await getMangaData(normalizedLegacyId);
  const targetManga = await getMangaData(normalizedTargetId);

  if (!sourceManga && targetManga) {
    await removeBookmarkKeyFromIndex(normalizedLegacyId);
    return;
  }

  if (sourceManga?.bookmarkStatus) {
    await replaceBookmark(normalizedLegacyId, {
      id: normalizedTargetId,
      title: target.title,
      bannerImage: target.bannerImage,
      ...(target.totalChapters !== undefined
        ? { totalChapters: target.totalChapters }
        : {}),
    });
  } else if (sourceManga) {
    await setMangaData({
      ...sourceManga,
      id: normalizedTargetId,
      title: target.title,
      bannerImage: target.bannerImage || sourceManga.bannerImage,
      ...(target.totalChapters !== undefined
        ? { totalChapters: target.totalChapters }
        : {}),
    });
    await AsyncStorage.removeItem(`manga_${normalizedLegacyId}`);
  }

  const lastReadManga = await getLastReadManga();
  if (lastReadManga?.id === normalizedLegacyId) {
    await setLastReadManga(
      normalizedTargetId,
      target.title,
      lastReadManga.chapterNumber
    );
  }

  const cachedDetails =
    await offlineCacheService.getCachedMangaDetails(normalizedLegacyId);
  if (cachedDetails) {
    await offlineCacheService.cacheMangaDetails(
      normalizedTargetId,
      {
        ...cachedDetails,
        id: normalizedTargetId,
        title: target.title,
        bannerImage: target.bannerImage || cachedDetails.bannerImage,
      },
      cachedDetails.isBookmarked
    );
    await offlineCacheService.removeMangaFromCache(normalizedLegacyId);
  }
}

export async function attemptLegacyMangaMigration(
  legacyId: string,
  onProgress?: (progress: MigrationProgress) => void
): Promise<AttemptLegacyMigrationResult> {
  const normalizedLegacyId = legacyId.trim();
  if (!normalizedLegacyId) {
    return { outcome: 'not_needed' };
  }

  const hidCandidate = extractHidFromCompositeId(normalizedLegacyId);
  if (hidCandidate && hidCandidate !== normalizedLegacyId) {
    const compositeDetails = await fetchTitleDetailsIfExists(hidCandidate);
    if (compositeDetails) {
      onProgress?.({
        phase: 'migrating',
        ...MIGRATION_MESSAGES.migrating,
      });

      await portLegacyMangaToNewId(normalizedLegacyId, {
        newId: hidCandidate,
        title: compositeDetails.title,
        bannerImage: posterFromTitleDetails(compositeDetails),
      });

      logger().info('Service', 'Migrated composite legacy manga ID', {
        legacyId: normalizedLegacyId,
        newId: hidCandidate,
        title: compositeDetails.title,
      });

      return { outcome: 'migrated', newId: hidCandidate };
    }
  }

  if (await titleExists(normalizedLegacyId)) {
    return { outcome: 'not_needed' };
  }

  if (!(await shouldAttemptLegacyMigration(normalizedLegacyId))) {
    if (await hasAttemptedLegacyMigration(normalizedLegacyId)) {
      return { outcome: 'skipped' };
    }
    return { outcome: 'not_needed' };
  }

  const storedManga = await getMangaData(normalizedLegacyId);
  const hintTitle = storedManga?.title;

  onProgress?.({
    phase: 'checking',
    ...MIGRATION_MESSAGES.checking,
  });

  const resolution = await resolveLegacyMangaId(normalizedLegacyId, hintTitle);

  if (resolution.status !== 'resolved') {
    await markLegacyMigrationAttempted(normalizedLegacyId);
    return {
      outcome: 'manual',
      legacyId: normalizedLegacyId,
      ...(hintTitle ? { hintTitle } : {}),
    };
  }

  onProgress?.({
    phase: 'migrating',
    ...MIGRATION_MESSAGES.migrating,
  });

  await portLegacyMangaToNewId(normalizedLegacyId, resolution);

  logger().info('Service', 'Migrated legacy manga ID', {
    legacyId: normalizedLegacyId,
    newId: resolution.newId,
    title: resolution.title,
  });

  return { outcome: 'migrated', newId: resolution.newId };
}
