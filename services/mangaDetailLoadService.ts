import { isLikelyLegacyMangaId } from '@/services/mangaIdMigrationService';
import type { MangaData } from '@/types/manga';
import {
  getBookmarkProgressFromMangaData,
  type BookmarkProgressSnapshot,
} from '@/utils/mangaOptimisticLoad';

export const MANGA_CACHE_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000;

export const MANGA_DETAIL_LOAD_PHASES = {
  LOCAL_HYDRATION: 'local_hydration',
  LEGACY_MIGRATION: 'legacy_migration',
  CACHE_LOOKUP: 'cache_lookup',
  NETWORK_DETAILS: 'network_details',
  READ_PROGRESS: 'read_progress',
  BOOKMARK_STATUS: 'bookmark_status',
  LAST_READ_CHAPTER: 'last_read_chapter',
  DOWNLOAD_STATE: 'download_state',
} as const;

export type MangaDetailLoadPhase =
  (typeof MANGA_DETAIL_LOAD_PHASES)[keyof typeof MANGA_DETAIL_LOAD_PHASES];

export interface MangaDetailLoadPhasePlan {
  phase: MangaDetailLoadPhase;
  blocking: boolean;
  deferred?: boolean;
  reason: string;
}

export interface MangaDetailLoadPlan {
  phases: MangaDetailLoadPhasePlan[];
  canRenderImmediately: boolean;
  shouldBlockOnNetwork: boolean;
  performanceRisks: string[];
}

export interface PhaseTiming {
  phase: MangaDetailLoadPhase;
  durationMs: number;
}

export function shouldRunMigrationBeforeDisplay(
  mangaId: string,
  hasInstantContent: boolean
): boolean {
  if (hasInstantContent) {
    return false;
  }

  return isLikelyLegacyMangaId(mangaId);
}

export function planMangaDetailLoad(options: {
  mangaId: string;
  hasInstantContent: boolean;
  hasCachedChapters: boolean;
  isOffline: boolean;
  hasRouteParams: boolean;
}): MangaDetailLoadPlan {
  const phases: MangaDetailLoadPhasePlan[] = [];
  const performanceRisks: string[] = [
    'Duplicate getMangaData reads when hydration and focus refresh both run',
    'Duplicate getCachedMangaDetails reads parse the full offline_manga_cache blob',
    'titleExists network call in legacy migration blocks render for all IDs today',
  ];

  const canRenderFromParams = options.hasRouteParams;
  const canRenderFromCache = options.hasInstantContent;
  const canRenderImmediately = canRenderFromParams || canRenderFromCache;

  phases.push({
    phase: MANGA_DETAIL_LOAD_PHASES.LOCAL_HYDRATION,
    blocking: !canRenderImmediately,
    reason: canRenderImmediately
      ? 'Route params or bookmark cache can render immediately'
      : 'Must read AsyncStorage before first paint',
  });

  const migrationBlocking = shouldRunMigrationBeforeDisplay(
    options.mangaId,
    canRenderFromCache
  );

  phases.push({
    phase: MANGA_DETAIL_LOAD_PHASES.LEGACY_MIGRATION,
    blocking: migrationBlocking,
    deferred: !migrationBlocking,
    reason: migrationBlocking
      ? 'Legacy slug IDs require migration lookup before trusting the ID'
      : 'Modern IDs or cached content should not block on migration',
  });

  if (!canRenderFromCache) {
    phases.push({
      phase: MANGA_DETAIL_LOAD_PHASES.CACHE_LOOKUP,
      blocking: !canRenderFromParams,
      reason: 'Secondary cache lookup inside focus effect',
    });
  }

  const shouldBlockOnNetwork =
    !options.isOffline &&
    !options.hasCachedChapters &&
    !canRenderFromCache;

  phases.push({
    phase: MANGA_DETAIL_LOAD_PHASES.NETWORK_DETAILS,
    blocking: shouldBlockOnNetwork,
    deferred: !shouldBlockOnNetwork,
    reason: shouldBlockOnNetwork
      ? 'No local manga data or cached chapter list available yet'
      : 'Saved manga data can render while chapters refresh in the background',
  });

  phases.push(
    {
      phase: MANGA_DETAIL_LOAD_PHASES.READ_PROGRESS,
      blocking: false,
      deferred: true,
      reason: 'Should reuse mangaData from hydration instead of re-reading storage',
    },
    {
      phase: MANGA_DETAIL_LOAD_PHASES.BOOKMARK_STATUS,
      blocking: false,
      deferred: true,
      reason: 'Should reuse mangaData from hydration instead of re-reading storage',
    },
    {
      phase: MANGA_DETAIL_LOAD_PHASES.LAST_READ_CHAPTER,
      blocking: false,
      deferred: true,
      reason: 'Should reuse mangaData from hydration instead of re-reading storage',
    },
    {
      phase: MANGA_DETAIL_LOAD_PHASES.DOWNLOAD_STATE,
      blocking: false,
      deferred: true,
      reason: 'Download metadata should never block the details header',
    }
  );

  return {
    phases,
    canRenderImmediately,
    shouldBlockOnNetwork,
    performanceRisks,
  };
}

export function shouldSkipBackgroundNetworkRefresh(
  cachedAt: number | undefined,
  now: number = Date.now()
): boolean {
  if (!cachedAt) {
    return false;
  }

  return now - cachedAt < MANGA_CACHE_REFRESH_MIN_INTERVAL_MS;
}

export function consolidateBookmarkProgress(
  mangaData: MangaData | null
): BookmarkProgressSnapshot {
  return getBookmarkProgressFromMangaData(mangaData);
}

export async function measurePhase(
  phase: MangaDetailLoadPhase,
  operation: () => Promise<void>,
  timings: PhaseTiming[]
): Promise<void> {
  const startedAt = Date.now();
  await operation();
  timings.push({
    phase,
    durationMs: Date.now() - startedAt,
  });
}
