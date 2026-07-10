import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  buildStartupCheckingProgress,
  collectLegacyMangaIds,
  detectLegacyStorageNeeds,
  needsMangaIdMigration,
  runStartupMigration,
} from '@/services/startupMigrationService';
import { isLegacySplitStorageKey } from '@/utils/legacyStorageKeys';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@/services/settingsService', () => ({
  migrateToNewStorage: jest.fn(),
}));

jest.mock('@/services/bookmarkService', () => ({
  getMangaData: jest.fn(),
  pruneStaleBookmarkIndexEntries: jest.fn().mockResolvedValue(0),
  removeBookmarkKeyFromIndex: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('@/services/mangaIdMigrationService', () => ({
  extractHidFromCompositeId: jest.fn((id: string) => {
    const match = id.match(/^.+\.([a-z0-9]{4,8})$/i);
    return match?.[1]?.toLowerCase() ?? null;
  }),
  hasAttemptedLegacyMigration: jest.fn(),
  isLikelyLegacyMangaId: jest.fn((id: string) => id.includes('-') || id.includes('_')),
  markLegacyMigrationAttempted: jest.fn(),
  portLegacyMangaToNewId: jest.fn(),
  resolveStoredMangaId: jest.fn(),
}));

const { migrateToNewStorage } = require('@/services/settingsService');
const {
  getMangaData,
  removeBookmarkKeyFromIndex,
} = require('@/services/bookmarkService');
const {
  hasAttemptedLegacyMigration,
  markLegacyMigrationAttempted,
  portLegacyMangaToNewId,
  resolveStoredMangaId,
} = require('@/services/mangaIdMigrationService');

describe('startupMigrationService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (hasAttemptedLegacyMigration as jest.Mock).mockResolvedValue(false);
    (getMangaData as jest.Mock).mockImplementation(async (id: string) => {
      const value = await AsyncStorage.getItem(`manga_${id}`);
      return value ? JSON.parse(value) : null;
    });
  });

  describe('isLegacySplitStorageKey', () => {
    it('detects old split bookmark storage keys', () => {
      expect(isLegacySplitStorageKey('bookmark_one-piece')).toBe(true);
      expect(isLegacySplitStorageKey('title_one-piece')).toBe(true);
      expect(isLegacySplitStorageKey('image_one-piece')).toBe(true);
      expect(isLegacySplitStorageKey('manga_one-piece_read_chapters')).toBe(
        true
      );
    });

    it('ignores new-format keys and bookmark indexes', () => {
      expect(isLegacySplitStorageKey('manga_pp5vq')).toBe(false);
      expect(isLegacySplitStorageKey('bookmarkKeys')).toBe(false);
      expect(isLegacySplitStorageKey('bookmarkChanged')).toBe(false);
    });
  });

  describe('detectLegacyStorageNeeds', () => {
    it('detects legacy split storage bookmarks', async () => {
      await AsyncStorage.multiSet([
        ['bookmark_one-piece', 'Reading'],
        ['title_one-piece', 'One Piece'],
      ]);

      const detection = await detectLegacyStorageNeeds();

      expect(detection.needsMigration).toBe(true);
      expect(detection.needsStorageMigration).toBe(true);
      expect(detection.needsProviderIdMigration).toBe(true);
      expect(detection.legacyBookmarkKeyCount).toBe(1);
      expect(detection.legacyMangaIds).toContain('one-piece');
    });

    it('detects both migration types when old storage contains legacy provider IDs', async () => {
      await AsyncStorage.multiSet([
        ['bookmark_special-civil-servantt.zxpn2', 'Reading'],
        ['title_special-civil-servantt.zxpn2', 'Special Civil Servant'],
        ['image_special-civil-servantt.zxpn2', 'old.jpg'],
      ]);

      const detection = await detectLegacyStorageNeeds();

      expect(detection.needsStorageMigration).toBe(true);
      expect(detection.needsProviderIdMigration).toBe(true);
      expect(detection.legacyMangaIds).toContain(
        'special-civil-servantt.zxpn2'
      );
      expect(buildStartupCheckingProgress(detection).message).toContain(
        'older MangaNess version'
      );
    });

    it('detects legacy manga IDs in the new storage format', async () => {
      await AsyncStorage.multiSet([
        ['bookmarkKeys', JSON.stringify(['bookmark_special-civil-servantt.zxpn2'])],
        [
          'manga_special-civil-servantt.zxpn2',
          JSON.stringify({
            id: 'special-civil-servantt.zxpn2',
            title: 'Special Civil Servant',
            bannerImage: 'old.jpg',
            bookmarkStatus: 'Reading',
            readChapters: [],
            lastUpdated: 1,
          }),
        ],
      ]);

      const detection = await detectLegacyStorageNeeds();

      expect(detection.needsMigration).toBe(true);
      expect(detection.legacyMangaIds).toContain(
        'special-civil-servantt.zxpn2'
      );
    });

    it('ignores orphaned legacy split keys without bookmark or manga data', async () => {
      await AsyncStorage.multiSet([
        ['title_one-piece', 'One Piece'],
        ['image_one-piece', 'old.jpg'],
        ['manga_one-piece_read_chapters', JSON.stringify(['1'])],
      ]);

      const detection = await detectLegacyStorageNeeds();

      expect(detection).toEqual({
        needsMigration: false,
        needsStorageMigration: false,
        needsProviderIdMigration: false,
        legacyBookmarkKeyCount: 0,
        legacyMangaIds: [],
      });
      expect(await AsyncStorage.getItem('title_one-piece')).toBeNull();
    });

    it('returns not needed for fully migrated libraries', async () => {
      await AsyncStorage.multiSet([
        ['bookmarkKeys', JSON.stringify(['bookmark_pp5vq'])],
        [
          'manga_pp5vq',
          JSON.stringify({
            id: 'pp5vq',
            title: 'Valid Manga',
            bannerImage: 'cover.jpg',
            bookmarkStatus: 'Reading',
            readChapters: [],
            lastUpdated: 1,
          }),
        ],
      ]);

      const detection = await detectLegacyStorageNeeds();

      expect(detection).toEqual({
        needsMigration: false,
        needsStorageMigration: false,
        needsProviderIdMigration: false,
        legacyBookmarkKeyCount: 0,
        legacyMangaIds: [],
      });
    });

    it('skips manga IDs that already had a migration attempt', async () => {
      (hasAttemptedLegacyMigration as jest.Mock).mockResolvedValue(true);

      await AsyncStorage.setItem(
        'manga_one-piece',
        JSON.stringify({
          id: 'one-piece',
          title: 'One Piece',
          bannerImage: 'old.jpg',
          bookmarkStatus: 'Reading',
          readChapters: [],
          lastUpdated: 1,
        })
      );

      const ids = await collectLegacyMangaIds(['manga_one-piece']);

      expect(ids).toEqual([]);
    });
  });

  describe('needsMangaIdMigration', () => {
    it('treats composite IDs as needing migration', async () => {
      await AsyncStorage.multiSet([
        ['bookmark_special-civil-servantt.zxpn2', 'Reading'],
        [
          'manga_special-civil-servantt.zxpn2',
          JSON.stringify({
            id: 'special-civil-servantt.zxpn2',
            title: 'Special Civil Servant',
            bannerImage: 'old.jpg',
            bookmarkStatus: 'Reading',
            readChapters: [],
            lastUpdated: 1,
          }),
        ],
      ]);

      await expect(
        needsMangaIdMigration('special-civil-servantt.zxpn2')
      ).resolves.toBe(true);
    });

    it('treats modern short IDs as not needing migration', async () => {
      await expect(needsMangaIdMigration('pp5vq')).resolves.toBe(false);
    });
  });

  describe('runStartupMigration', () => {
    it('returns not_needed when no legacy data exists', async () => {
      const onProgress = jest.fn();

      const result = await runStartupMigration(onProgress);

      expect(result).toEqual({
        outcome: 'not_needed',
        storageMigrated: 0,
        idsRemapped: 0,
        idsKeptLocal: 0,
        failures: 0,
      });
      expect(onProgress).not.toHaveBeenCalled();
      expect(migrateToNewStorage).not.toHaveBeenCalled();
    });

    it('runs storage migration before provider ID migration when both are needed', async () => {
      await AsyncStorage.multiSet([
        ['bookmark_one-piece', 'Reading'],
        ['title_one-piece', 'One Piece'],
        ['image_one-piece', 'old.jpg'],
      ]);

      const callOrder: string[] = [];

      (migrateToNewStorage as jest.Mock).mockImplementation(async () => {
        callOrder.push('storage');
        await AsyncStorage.multiSet([
          ['bookmarkKeys', JSON.stringify(['bookmark_one-piece'])],
          [
            'manga_one-piece',
            JSON.stringify({
              id: 'one-piece',
              title: 'One Piece',
              bannerImage: 'old.jpg',
              bookmarkStatus: 'Reading',
              readChapters: ['1'],
              lastUpdated: 1,
            }),
          ],
        ]);
        return {
          success: true,
          message: 'Migrated 1 manga to the new storage format',
        };
      });

      (resolveStoredMangaId as jest.Mock).mockResolvedValue({
        action: 'remap',
        fromId: 'one-piece',
        toId: '703y6',
        title: 'One Piece',
        bannerImage: 'new.jpg',
      });
      (portLegacyMangaToNewId as jest.Mock).mockImplementation(async () => {
        callOrder.push('provider');
      });

      const progressPhases: string[] = [];
      const result = await runStartupMigration((progress) => {
        progressPhases.push(progress.phase);
      });

      expect(callOrder).toEqual(['storage', 'provider']);
      expect(migrateToNewStorage).toHaveBeenCalledTimes(1);
      expect(portLegacyMangaToNewId).toHaveBeenCalledWith('one-piece', {
        newId: '703y6',
        title: 'One Piece',
        bannerImage: 'new.jpg',
      });
      expect(progressPhases).toEqual([
        'checking',
        'migrating_storage',
        'migrating_ids',
        'complete',
      ]);
      expect(result.outcome).toBe('completed');
      expect(result.storageMigrated).toBe(1);
      expect(result.idsRemapped).toBe(1);
    });

    it('migrates legacy split storage on startup', async () => {
      await AsyncStorage.multiSet([
        ['bookmark_pp5vq', 'Reading'],
        ['title_pp5vq', 'Valid Manga'],
      ]);
      (migrateToNewStorage as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Migrated 1 manga to the new storage format',
      });

      const progressPhases: string[] = [];
      const result = await runStartupMigration((progress) => {
        progressPhases.push(progress.phase);
      });

      expect(migrateToNewStorage).toHaveBeenCalled();
      expect(result.outcome).toBe('completed');
      expect(result.storageMigrated).toBe(1);
      expect(progressPhases).toEqual([
        'checking',
        'migrating_storage',
        'complete',
      ]);
    });

    it('remaps legacy manga IDs after storage migration', async () => {
      await AsyncStorage.multiSet([
        ['bookmarkKeys', JSON.stringify(['bookmark_one-piece'])],
        [
          'manga_one-piece',
          JSON.stringify({
            id: 'one-piece',
            title: 'One Piece',
            bannerImage: 'old.jpg',
            bookmarkStatus: 'Reading',
            readChapters: ['1'],
            lastUpdated: 1,
          }),
        ],
      ]);
      (resolveStoredMangaId as jest.Mock).mockResolvedValue({
        action: 'remap',
        fromId: 'one-piece',
        toId: '703y6',
        title: 'One Piece',
        bannerImage: 'new.jpg',
      });

      const result = await runStartupMigration();

      expect(portLegacyMangaToNewId).toHaveBeenCalledWith('one-piece', {
        newId: '703y6',
        title: 'One Piece',
        bannerImage: 'new.jpg',
      });
      expect(result.outcome).toBe('completed');
      expect(result.idsRemapped).toBe(1);
    });

    it('marks unresolved legacy IDs as attempted instead of looping forever', async () => {
      await AsyncStorage.setItem(
        'manga_missing-manga',
        JSON.stringify({
          id: 'missing-manga',
          title: 'Missing',
          bannerImage: 'old.jpg',
          bookmarkStatus: 'Reading',
          readChapters: [],
          lastUpdated: 1,
        })
      );
      (resolveStoredMangaId as jest.Mock).mockResolvedValue({
        action: 'local_only',
        id: 'missing-manga',
      });

      const result = await runStartupMigration();

      expect(markLegacyMigrationAttempted).toHaveBeenCalledWith('missing-manga');
      expect(result.idsKeptLocal).toBe(1);
      expect(result.outcome).toBe('not_needed');
    });

    it('skips repeat startup migration after completion flag is set', async () => {
      await AsyncStorage.setItem('startup_migration_completed_v1', 'true');
      await AsyncStorage.multiSet([
        ['bookmarkKeys', JSON.stringify(['bookmark_one-piece'])],
        [
          'manga_one-piece',
          JSON.stringify({
            id: 'one-piece',
            title: 'One Piece',
            bannerImage: 'old.jpg',
            bookmarkStatus: 'Reading',
            readChapters: [],
            lastUpdated: 1,
          }),
        ],
      ]);

      const onProgress = jest.fn();
      const result = await runStartupMigration(onProgress);

      expect(result.outcome).toBe('not_needed');
      expect(onProgress).not.toHaveBeenCalled();
      expect(migrateToNewStorage).not.toHaveBeenCalled();
      expect(removeBookmarkKeyFromIndex).toHaveBeenCalledWith('one-piece');
    });

    it('marks startup migration complete after a successful run', async () => {
      await AsyncStorage.setItem(
        'manga_one-piece',
        JSON.stringify({
          id: 'one-piece',
          title: 'One Piece',
          bannerImage: 'old.jpg',
          bookmarkStatus: 'Reading',
          readChapters: [],
          lastUpdated: 1,
        })
      );
      (resolveStoredMangaId as jest.Mock).mockResolvedValue({
        action: 'local_only',
        id: 'one-piece',
      });

      await runStartupMigration();

      expect(await AsyncStorage.getItem('startup_migration_completed_v1')).toBe(
        'true'
      );
    });

    it('reports failure when every migration step fails', async () => {
      await AsyncStorage.setItem('bookmark_one-piece', 'Reading');
      (migrateToNewStorage as jest.Mock).mockResolvedValue({
        success: false,
        message: 'Migration failed: network',
      });
      (resolveStoredMangaId as jest.Mock).mockRejectedValue(
        new Error('Provider lookup failed')
      );

      const result = await runStartupMigration();

      expect(result.outcome).toBe('failed');
      expect(result.failures).toBeGreaterThanOrEqual(1);
    });
  });
});
