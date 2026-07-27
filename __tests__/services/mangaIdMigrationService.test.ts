import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  attemptLegacyMangaMigration,
  extractHidFromCompositeId,
  extractSlugFromLegacyId,
  extractSlugFromMangaLink,
  isLikelyLegacyMangaId,
  portLegacyMangaToNewId,
  resolveLegacyMangaId,
  resolveStoredMangaId,
} from '@/services/mangaIdMigrationService';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@/services/mangaFireApi', () => ({
  searchTitles: jest.fn(),
  titleExists: jest.fn(),
  fetchTitleDetailsIfExists: jest.fn(),
}));

jest.mock('@/services/bookmarkService', () => ({
  getMangaData: jest.fn(),
  replaceBookmark: jest.fn(),
  setMangaData: jest.fn(),
}));

jest.mock('@/services/readChapterService', () => ({
  getLastReadManga: jest.fn(),
  setLastReadManga: jest.fn(),
}));

jest.mock('@/services/offlineCacheService', () => ({
  offlineCacheService: {
    getCachedMangaDetails: jest.fn(),
    cacheMangaDetails: jest.fn(),
    removeMangaFromCache: jest.fn(),
  },
}));

const { searchTitles, titleExists, fetchTitleDetailsIfExists } = require('@/services/mangaFireApi');
const {
  getMangaData,
  replaceBookmark,
  setMangaData,
} = require('@/services/bookmarkService');
const { getLastReadManga, setLastReadManga } = require(
  '@/services/readChapterService'
);
const { offlineCacheService } = require('@/services/offlineCacheService');

describe('mangaIdMigrationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (titleExists as jest.Mock).mockResolvedValue(false);
    (fetchTitleDetailsIfExists as jest.Mock).mockResolvedValue(null);
    (getMangaData as jest.Mock).mockResolvedValue(null);
    (getLastReadManga as jest.Mock).mockResolvedValue(null);
    (offlineCacheService.getCachedMangaDetails as jest.Mock).mockResolvedValue(
      null
    );
  });

  describe('isLikelyLegacyMangaId', () => {
    it('treats slug-style IDs as legacy', () => {
      expect(isLikelyLegacyMangaId('one-piece')).toBe(true);
      expect(isLikelyLegacyMangaId('solo_leveling')).toBe(true);
    });

    it('treats short new-style IDs as non-legacy', () => {
      expect(isLikelyLegacyMangaId('92kk8')).toBe(false);
      expect(isLikelyLegacyMangaId('703y6')).toBe(false);
    });
  });

  describe('extractSlugFromMangaLink', () => {
    it('extracts the slug from a title URL', () => {
      expect(
        extractSlugFromMangaLink('https://mangafire.to/title/one-piece.703y6')
      ).toBe('one-piece');
    });
  });

  describe('extractHidFromCompositeId', () => {
    it('extracts the hid from slug.hid composite IDs', () => {
      expect(extractHidFromCompositeId('tougen-ankii.37z1y')).toBe('37z1y');
      expect(extractHidFromCompositeId('one-piece.703y6')).toBe('703y6');
    });

    it('returns null for non-composite IDs', () => {
      expect(extractHidFromCompositeId('one-piece')).toBeNull();
      expect(extractHidFromCompositeId('703y6')).toBeNull();
    });
  });

  describe('extractSlugFromLegacyId', () => {
    it('extracts slug from composite legacy IDs', () => {
      expect(extractSlugFromLegacyId('tougen-ankii.37z1y')).toBe(
        'tougen-ankii'
      );
    });

    it('returns slug-style IDs unchanged', () => {
      expect(extractSlugFromLegacyId('one-piece')).toBe('one-piece');
    });
  });

  describe('resolveStoredMangaId', () => {
    it('remaps composite legacy IDs to the API hid without probing the composite URL', async () => {
      (fetchTitleDetailsIfExists as jest.Mock).mockImplementation(
        async (id: string) => {
          if (id === '37z1y') {
            return {
              hid: '37z1y',
              title: 'Tougen Anki',
              poster: { large: 'https://example.com/tougen.jpg' },
            };
          }
          return null;
        }
      );

      const result = await resolveStoredMangaId(
        'tougen-ankii.37z1y',
        'Tougen Anki'
      );

      expect(fetchTitleDetailsIfExists).toHaveBeenCalledTimes(1);
      expect(fetchTitleDetailsIfExists).toHaveBeenCalledWith('37z1y');
      expect(result).toEqual({
        action: 'remap',
        fromId: 'tougen-ankii.37z1y',
        toId: '37z1y',
        title: 'Tougen Anki',
        bannerImage: 'https://example.com/tougen.jpg',
      });
    });

    it('uses the current ID when it already exists on the API', async () => {
      (fetchTitleDetailsIfExists as jest.Mock).mockResolvedValue({
        hid: '703y6',
        title: 'One Piece',
        poster: { large: 'https://example.com/one-piece.jpg' },
      });

      const result = await resolveStoredMangaId('703y6');

      expect(fetchTitleDetailsIfExists).toHaveBeenCalledWith('703y6');
      expect(result).toEqual({
        action: 'use_current',
        id: '703y6',
        title: 'One Piece',
        bannerImage: 'https://example.com/one-piece.jpg',
      });
    });

    it('falls back to local-only when no online match exists', async () => {
      (fetchTitleDetailsIfExists as jest.Mock).mockResolvedValue(null);
      (searchTitles as jest.Mock).mockResolvedValue([]);

      const result = await resolveStoredMangaId('missing-manga', 'Missing');

      expect(result).toEqual({
        action: 'local_only',
        id: 'missing-manga',
      });
    });
  });

  describe('resolveLegacyMangaId', () => {
    it('resolves an exact slug match', async () => {
      (searchTitles as jest.Mock).mockResolvedValue([
        {
          id: '703y6',
          title: 'One Piece',
          banner: 'https://example.com/one-piece.jpg',
          imageUrl: 'https://example.com/one-piece.jpg',
          link: 'https://mangafire.to/title/one-piece.703y6',
          type: 'manga',
        },
      ]);

      const result = await resolveLegacyMangaId('one-piece', 'One Piece');

      expect(result).toEqual({
        status: 'resolved',
        newId: '703y6',
        title: 'One Piece',
        bannerImage: 'https://example.com/one-piece.jpg',
      });
    });

    it('returns not_found when no confident match exists', async () => {
      (searchTitles as jest.Mock).mockResolvedValue([
        {
          id: 'abc12',
          title: 'Unrelated Manga',
          banner: 'https://example.com/unrelated.jpg',
          imageUrl: 'https://example.com/unrelated.jpg',
          link: 'https://mangafire.to/title/unrelated.abc12',
          type: 'manga',
        },
      ]);

      const result = await resolveLegacyMangaId('one-piece');

      expect(result).toEqual({ status: 'not_found' });
    });
  });

  describe('portLegacyMangaToNewId', () => {
    it('moves bookmarked manga through replaceBookmark', async () => {
      (getMangaData as jest.Mock).mockResolvedValue({
        id: 'one-piece',
        title: 'One Piece',
        bannerImage: 'old.jpg',
        bookmarkStatus: 'Reading',
        readChapters: ['1'],
        lastUpdated: 1,
      });

      await portLegacyMangaToNewId('one-piece', {
        newId: '703y6',
        title: 'One Piece',
        bannerImage: 'new.jpg',
      });

      expect(replaceBookmark).toHaveBeenCalledWith('one-piece', {
        id: '703y6',
        title: 'One Piece',
        bannerImage: 'new.jpg',
      });
    });

    it('updates last-read manga when the legacy ID was active', async () => {
      (getMangaData as jest.Mock).mockResolvedValue({
        id: 'one-piece',
        title: 'One Piece',
        bannerImage: 'old.jpg',
        bookmarkStatus: null,
        readChapters: ['5'],
        lastUpdated: 1,
      });
      (getLastReadManga as jest.Mock).mockResolvedValue({
        id: 'one-piece',
        title: 'One Piece',
        chapterNumber: '5',
        timestamp: 1,
      });

      await portLegacyMangaToNewId('one-piece', {
        newId: '703y6',
        title: 'One Piece',
        bannerImage: 'new.jpg',
      });

      expect(setMangaData).toHaveBeenCalled();
      expect(setLastReadManga).toHaveBeenCalledWith(
        '703y6',
        'One Piece',
        '5'
      );
    });
  });

  describe('attemptLegacyMangaMigration', () => {
    it('skips network lookup for modern short manga IDs', async () => {
      const result = await attemptLegacyMangaMigration('92kk8');

      expect(result).toEqual({ outcome: 'not_needed' });
      expect(titleExists).not.toHaveBeenCalled();
      expect(fetchTitleDetailsIfExists).not.toHaveBeenCalled();
      expect(searchTitles).not.toHaveBeenCalled();
    });

    it('migrates composite legacy bookmarks without slug search', async () => {
      (fetchTitleDetailsIfExists as jest.Mock).mockResolvedValue({
        hid: 'zxpn2',
        title: 'Special Civil Servant',
        poster: { large: 'https://example.com/special.jpg' },
      });
      (getMangaData as jest.Mock).mockResolvedValue({
        id: 'special-civil-servantt.zxpn2',
        title: 'Special Civil Servant',
        bannerImage: 'old.jpg',
        bookmarkStatus: 'Reading',
        readChapters: ['1'],
        lastUpdated: 1,
      });

      const result = await attemptLegacyMangaMigration(
        'special-civil-servantt.zxpn2'
      );

      expect(result).toEqual({ outcome: 'migrated', newId: 'zxpn2' });
      expect(searchTitles).not.toHaveBeenCalled();
      expect(replaceBookmark).toHaveBeenCalledWith(
        'special-civil-servantt.zxpn2',
        expect.objectContaining({ id: 'zxpn2' })
      );
    });

    it('migrates a legacy bookmark on first open', async () => {
      (getMangaData as jest.Mock).mockResolvedValue({
        id: 'one-piece',
        title: 'One Piece',
        bannerImage: 'old.jpg',
        bookmarkStatus: 'Reading',
        readChapters: ['1'],
        lastUpdated: 1,
      });
      (searchTitles as jest.Mock).mockResolvedValue([
        {
          id: '703y6',
          title: 'One Piece',
          banner: 'https://example.com/one-piece.jpg',
          imageUrl: 'https://example.com/one-piece.jpg',
          link: 'https://mangafire.to/title/one-piece.703y6',
          type: 'manga',
        },
      ]);

      const progress: string[] = [];
      const result = await attemptLegacyMangaMigration('one-piece', (state) => {
        progress.push(state.phase);
      });

      expect(result).toEqual({ outcome: 'migrated', newId: '703y6' });
      expect(progress).toEqual(['checking', 'migrating']);
      expect(replaceBookmark).toHaveBeenCalled();
    });

    it('asks for manual replacement when no match is found', async () => {
      (getMangaData as jest.Mock).mockResolvedValue({
        id: 'one-piece',
        title: 'One Piece',
        bannerImage: 'old.jpg',
        bookmarkStatus: 'Reading',
        readChapters: ['1'],
        lastUpdated: 1,
      });
      (searchTitles as jest.Mock).mockResolvedValue([]);

      const result = await attemptLegacyMangaMigration('one-piece');

      expect(result).toEqual({
        outcome: 'manual',
        legacyId: 'one-piece',
        hintTitle: 'One Piece',
      });

      const attempts = await AsyncStorage.getItem('manga_id_migration_attempts');
      expect(attempts).toContain('one-piece');
    });
  });
});
