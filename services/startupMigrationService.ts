import AsyncStorage from '@react-native-async-storage/async-storage';
import { migrateToNewStorage } from '@/services/settingsService';
import {
  getMangaData,
  pruneStaleBookmarkIndexEntries,
  removeBookmarkKeyFromIndex,
} from '@/services/bookmarkService';
import {
  extractHidFromCompositeId,
  hasAttemptedLegacyMigration,
  isLikelyLegacyMangaId,
  markLegacyMigrationAttempted,
  portLegacyMangaToNewId,
  resolveStoredMangaId,
} from '@/services/mangaIdMigrationService';
import {
  isLegacyBookmarkSplitKey,
  isLegacySplitStorageKey,
  isOrphanedLegacySplitKey,
} from '@/utils/legacyStorageKeys';
import { logger } from '@/utils/logger';

const BOOKMARK_KEYS_KEY = 'bookmarkKeys';
const STARTUP_MIGRATION_COMPLETED_KEY = 'startup_migration_completed_v1';
export { isLegacySplitStorageKey } from '@/utils/legacyStorageKeys';

export type StartupMigrationPhase =
  | 'checking'
  | 'migrating_storage'
  | 'migrating_ids'
  | 'complete';

export interface StartupMigrationProgress {
  phase: StartupMigrationPhase;
  title: string;
  message: string;
  current?: number;
  total?: number;
}

export interface LegacyStorageDetection {
  needsMigration: boolean;
  needsStorageMigration: boolean;
  needsProviderIdMigration: boolean;
  legacyBookmarkKeyCount: number;
  legacyMangaIds: string[];
}

export type StartupMigrationOutcome = 'not_needed' | 'completed' | 'failed';

export interface StartupMigrationResult {
  outcome: StartupMigrationOutcome;
  storageMigrated: number;
  idsRemapped: number;
  idsKeptLocal: number;
  failures: number;
}

export const STARTUP_MIGRATION_MESSAGES = {
  checking: {
    title: 'Checking your library',
    message:
      'We are looking for bookmarks and reading progress saved from an older version of MangaNess.',
  },
  checkingBoth: {
    title: 'Checking your library',
    message:
      'We found data from an older MangaNess version and outdated MangaFire links. We will update your saved library first, then refresh your manga links.',
  },
  migrating_storage: {
    title: 'Updating saved data',
    message:
      'MangaNess recently changed how bookmarks are stored. We are moving your library to the new format now.',
  },
  migrating_ids: {
    title: 'Updating manga links',
    message:
      'MangaFire changed how manga links work. We are updating your bookmarks to the new links and keeping your reading progress.',
  },
  complete: {
    title: 'Migration complete',
    message:
      'Your library has been updated for the latest version of MangaNess.',
  },
} as const;

export function buildStartupCheckingProgress(
  detection: Pick<
    LegacyStorageDetection,
    'needsStorageMigration' | 'needsProviderIdMigration'
  >
): StartupMigrationProgress {
  const needsBoth =
    detection.needsStorageMigration && detection.needsProviderIdMigration;

  return {
    phase: 'checking',
  ...(needsBoth
    ? STARTUP_MIGRATION_MESSAGES.checkingBoth
    : STARTUP_MIGRATION_MESSAGES.checking),
  };
}

export async function hasCompletedStartupMigration(): Promise<boolean> {
  const value = await AsyncStorage.getItem(STARTUP_MIGRATION_COMPLETED_KEY);
  return value === 'true';
}

export async function markStartupMigrationCompleted(): Promise<void> {
  await AsyncStorage.setItem(STARTUP_MIGRATION_COMPLETED_KEY, 'true');
}

async function hasPersistedMangaData(id: string): Promise<boolean> {
  return Boolean(await getMangaData(id));
}

async function hasLegacySplitStorageForId(
  id: string,
  allKeys: readonly string[]
): Promise<boolean> {
  const legacyId = id.trim();
  if (!legacyId) {
    return false;
  }

  return allKeys.some(
    (key) =>
      key === `bookmark_${legacyId}` ||
      key === `title_${legacyId}` ||
      key === `image_${legacyId}` ||
      key === `manga_${legacyId}_read_chapters`
  );
}

export async function needsMangaIdMigration(
  id: string,
  allKeys?: readonly string[]
): Promise<boolean> {
  const normalizedId = id.trim();
  if (!normalizedId) {
    return false;
  }

  if (await hasAttemptedLegacyMigration(normalizedId)) {
    return false;
  }

  const keys = allKeys ?? (await AsyncStorage.getAllKeys());
  const hasStoredManga = await hasPersistedMangaData(normalizedId);
  const hasLegacySplitStorage = await hasLegacySplitStorageForId(
    normalizedId,
    keys
  );

  if (!hasStoredManga && !hasLegacySplitStorage) {
    const raw = await AsyncStorage.getItem(BOOKMARK_KEYS_KEY);
    const bookmarkKeys: string[] = raw ? JSON.parse(raw) : [];
    if (!bookmarkKeys.includes(`bookmark_${normalizedId}`)) {
      return false;
    }
  }

  if (extractHidFromCompositeId(normalizedId)) {
    return true;
  }

  return isLikelyLegacyMangaId(normalizedId);
}

export async function collectLegacyMangaIds(
  allKeys: readonly string[]
): Promise<string[]> {
  const ids = new Set<string>();

  for (const key of allKeys) {
    if (key.startsWith('bookmark_') && isLegacySplitStorageKey(key)) {
      const id = key.replace('bookmark_', '');
      if (await needsMangaIdMigration(id, allKeys)) {
        ids.add(id);
      }
      continue;
    }

    if (!key.startsWith('manga_') || key.endsWith('_read_chapters')) {
      continue;
    }

    const id = key.slice('manga_'.length);
    if (await needsMangaIdMigration(id, allKeys)) {
      ids.add(id);
    }
  }

  try {
    const raw = await AsyncStorage.getItem(BOOKMARK_KEYS_KEY);
    const keys: string[] = raw ? JSON.parse(raw) : [];

    for (const key of keys) {
      const id = key.replace('bookmark_', '');
      if (await needsMangaIdMigration(id, allKeys)) {
        ids.add(id);
      }
    }
  } catch (error) {
    logger().warn('Storage', 'Failed to read bookmark index during migration scan', {
      error: error instanceof Error ? error.message : String(error),
    });
  }

  return Array.from(ids);
}

async function cleanupOrphanedLegacySplitKeys(
  allKeys: readonly string[]
): Promise<number> {
  const keysToRemove = allKeys.filter((key) =>
    isOrphanedLegacySplitKey(key, allKeys)
  );

  if (keysToRemove.length > 0) {
    await AsyncStorage.multiRemove(keysToRemove);
  }

  return keysToRemove.length;
}

function countLegacyBookmarkSplitKeys(allKeys: readonly string[]): number {
  return allKeys.filter(isLegacyBookmarkSplitKey).length;
}

export async function detectLegacyStorageNeeds(): Promise<LegacyStorageDetection> {
  await pruneStaleBookmarkIndexEntries();

  let allKeys = await AsyncStorage.getAllKeys();
  await cleanupOrphanedLegacySplitKeys(allKeys);
  allKeys = await AsyncStorage.getAllKeys();

  if (await hasCompletedStartupMigration()) {
    const staleLegacyIds = await collectLegacyMangaIds(allKeys);
    if (staleLegacyIds.length > 0) {
      await finalizeStartupMigration(staleLegacyIds);
      allKeys = await AsyncStorage.getAllKeys();
    }
  }

  const legacyBookmarkKeyCount = countLegacyBookmarkSplitKeys(allKeys);
  const legacyMangaIds = await collectLegacyMangaIds(allKeys);
  const needsStorageMigration = legacyBookmarkKeyCount > 0;
  const needsProviderIdMigration = legacyMangaIds.length > 0;

  return {
    needsMigration: needsStorageMigration || needsProviderIdMigration,
    needsStorageMigration,
    needsProviderIdMigration,
    legacyBookmarkKeyCount,
    legacyMangaIds,
  };
}

async function finalizeStartupMigration(
  pendingLegacyIds: string[]
): Promise<void> {
  await pruneStaleBookmarkIndexEntries();

  for (const legacyId of pendingLegacyIds) {
    await markLegacyMigrationAttempted(legacyId);
    await removeBookmarkKeyFromIndex(legacyId);
  }

  await markStartupMigrationCompleted();
}

async function migrateProviderMangaIds(
  legacyMangaIds: string[],
  onProgress?: (progress: StartupMigrationProgress) => void
): Promise<{
  idsRemapped: number;
  idsKeptLocal: number;
  failures: number;
}> {
  const log = logger();
  let idsRemapped = 0;
  let idsKeptLocal = 0;
  let failures = 0;

  if (legacyMangaIds.length === 0) {
    return { idsRemapped, idsKeptLocal, failures };
  }

  for (let index = 0; index < legacyMangaIds.length; index += 1) {
    const legacyId = legacyMangaIds[index]!;

    try {
      const storedManga = await getMangaData(legacyId);
      const resolution = await resolveStoredMangaId(
        legacyId,
        storedManga?.title
      );

      if (resolution.action === 'remap') {
        onProgress?.({
          phase: 'migrating_ids',
          title: STARTUP_MIGRATION_MESSAGES.migrating_ids.title,
          message: `Updating bookmark ${index + 1} of ${legacyMangaIds.length}...`,
          current: index + 1,
          total: legacyMangaIds.length,
        });
        await portLegacyMangaToNewId(legacyId, {
          newId: resolution.toId,
          title: resolution.title,
          bannerImage: resolution.bannerImage,
        });
        idsRemapped += 1;
        continue;
      }

      if (resolution.action === 'use_current' && resolution.id !== legacyId) {
        onProgress?.({
          phase: 'migrating_ids',
          title: STARTUP_MIGRATION_MESSAGES.migrating_ids.title,
          message: `Updating bookmark ${index + 1} of ${legacyMangaIds.length}...`,
          current: index + 1,
          total: legacyMangaIds.length,
        });
        await portLegacyMangaToNewId(legacyId, {
          newId: resolution.id,
          title: resolution.title,
          bannerImage: resolution.bannerImage,
        });
        idsRemapped += 1;
        continue;
      }

      await markLegacyMigrationAttempted(legacyId);
      idsKeptLocal += 1;
    } catch (error) {
      failures += 1;
      log.error('Service', 'Startup legacy manga ID migration failed', {
        legacyId,
        error,
      });
    }
  }

  return { idsRemapped, idsKeptLocal, failures };
}

export async function runStartupMigration(
  onProgress?: (progress: StartupMigrationProgress) => void
): Promise<StartupMigrationResult> {
  const log = logger();
  const initialDetection = await detectLegacyStorageNeeds();

  if (!initialDetection.needsMigration) {
    return {
      outcome: 'not_needed',
      storageMigrated: 0,
      idsRemapped: 0,
      idsKeptLocal: 0,
      failures: 0,
    };
  }

  if (
    (await hasCompletedStartupMigration()) &&
    !initialDetection.needsStorageMigration
  ) {
    await finalizeStartupMigration(initialDetection.legacyMangaIds);
    return {
      outcome: 'not_needed',
      storageMigrated: 0,
      idsRemapped: 0,
      idsKeptLocal: 0,
      failures: 0,
    };
  }

  if (initialDetection.needsStorageMigration) {
    onProgress?.(buildStartupCheckingProgress(initialDetection));
  }

  let storageMigrated = 0;
  let idsRemapped = 0;
  let idsKeptLocal = 0;
  let failures = 0;

  if (initialDetection.needsStorageMigration) {
    onProgress?.({
      phase: 'migrating_storage',
      ...STARTUP_MIGRATION_MESSAGES.migrating_storage,
    });

    const storageResult = await migrateToNewStorage();
    if (storageResult.success) {
      const match = storageResult.message.match(/Migrated (\d+) manga/);
      storageMigrated = match?.[1] ? Number.parseInt(match[1], 10) : 0;
    } else {
      failures += 1;
      log.error('Service', 'Startup storage migration failed', {
        message: storageResult.message,
      });
    }
  }

  const postStorageDetection = await detectLegacyStorageNeeds();
  const providerMigration = await migrateProviderMangaIds(
    postStorageDetection.legacyMangaIds,
    onProgress
  );

  idsRemapped = providerMigration.idsRemapped;
  idsKeptLocal = providerMigration.idsKeptLocal;
  failures += providerMigration.failures;

  const didMigrate = storageMigrated > 0 || idsRemapped > 0;

  if (failures === 0 || didMigrate) {
    await finalizeStartupMigration(postStorageDetection.legacyMangaIds);
  }

  if (failures > 0 && !didMigrate) {
    return {
      outcome: 'failed',
      storageMigrated,
      idsRemapped,
      idsKeptLocal,
      failures,
    };
  }

  if (!didMigrate) {
    return {
      outcome: 'not_needed',
      storageMigrated,
      idsRemapped,
      idsKeptLocal,
      failures,
    };
  }

  onProgress?.({
    phase: 'complete',
    ...STARTUP_MIGRATION_MESSAGES.complete,
  });

  return {
    outcome: 'completed',
    storageMigrated,
    idsRemapped,
    idsKeptLocal,
    failures,
  };
}
