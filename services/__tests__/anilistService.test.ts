import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  isLoggedInToAniList,
  searchAnilistMangaByName,
  saveMangaMapping,
  getAnilistIdFromInternalId,
  updateMangaStatus,
  updateAniListStatus,
  syncAllMangaWithAniList,
} from '../anilistService';

jest.mock('../anilistOAuth', () => ({
  getAuthData: jest.fn(),
}));

jest.mock('../mangaMappingService', () => ({
  saveMangaMapping: jest.fn(),
  getAnilistIdFromInternalId: jest.fn(),
}));

jest.mock('../bookmarkService', () => ({
  getMangaData: jest.fn(),
}));

jest.mock('@/constants/env', () => ({
  isDebugEnabled: () => false,
}));

const { getAuthData } = require('../anilistOAuth');
const mapping = require('../mangaMappingService');
const { getMangaData } = require('../bookmarkService');

describe('anilistService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    jest.clearAllMocks();
    globalThis.fetch = jest.fn();
    (Date.now as unknown as jest.Mock | undefined)?.mockRestore?.();
    await AsyncStorage.clear();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  describe('isLoggedInToAniList', () => {
    it('detects login status based on stored auth data', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'token',
        expiresAt: Date.now() + 10000,
      });
      expect(await isLoggedInToAniList()).toBe(true);

      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'token',
        expiresAt: Date.now() - 1000,
      });
      expect(await isLoggedInToAniList()).toBe(false);
    });

    it('returns false when no auth data exists', async () => {
      (getAuthData as jest.Mock).mockResolvedValue(null);
      expect(await isLoggedInToAniList()).toBe(false);
    });

    it('returns false on error', async () => {
      (getAuthData as jest.Mock).mockRejectedValue(new Error('Storage error'));
      expect(await isLoggedInToAniList()).toBe(false);
    });
  });

  describe('searchAnilistMangaByName', () => {
    it('searches AniList manga by name', async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({ data: { Media: { id: 1 } } }),
        ok: true,
      });

      const result = await searchAnilistMangaByName('Test');
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://graphql.anilist.co',
        expect.any(Object)
      );
      expect(result).toEqual({ id: 1 });
    });

    it('returns null when manga not found', async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({ data: { Media: null } }),
        ok: true,
      });

      const result = await searchAnilistMangaByName('Nonexistent');
      expect(result).toBeNull();
    });

    it('returns null on API error', async () => {
      (globalThis.fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({ errors: [{ message: 'Not found' }] }),
        ok: true,
      });

      const result = await searchAnilistMangaByName('Error');
      expect(result).toBeNull();
    });

    it('returns null on network error', async () => {
      (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await searchAnilistMangaByName('NetworkError');
      expect(result).toBeNull();
    });
  });

  describe('manga mapping helpers', () => {
    it('delegates manga mapping helpers', async () => {
      (mapping.saveMangaMapping as jest.Mock).mockResolvedValue(undefined);
      await saveMangaMapping('id', 5, 'Title');
      expect(mapping.saveMangaMapping).toHaveBeenCalledWith('id', 5, 'Title');

      (mapping.getAnilistIdFromInternalId as jest.Mock).mockResolvedValue(99);
      const id = await getAnilistIdFromInternalId('id');
      expect(id).toBe(99);
    });

    it('handles save mapping errors gracefully', async () => {
      (mapping.saveMangaMapping as jest.Mock).mockRejectedValue(new Error('Save error'));

      // Should not throw
      await saveMangaMapping('id', 5, 'Title');
      expect(mapping.saveMangaMapping).toHaveBeenCalled();
    });

    it('returns null on get mapping error', async () => {
      (mapping.getAnilistIdFromInternalId as jest.Mock).mockRejectedValue(
        new Error('Get error')
      );

      const result = await getAnilistIdFromInternalId('error-id');
      expect(result).toBeNull();
    });
  });

  describe('updateMangaStatus', () => {
    it('updates manga status when authenticated', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'abc',
        expiresAt: Date.now() + 1000,
      });

      (globalThis.fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({ data: { result: true } }),
        ok: true,
      });

      await updateMangaStatus(1, 'CURRENT', 10);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://graphql.anilist.co',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer abc' }),
        })
      );
    });

    it('skips updates when not authenticated', async () => {
      (getAuthData as jest.Mock).mockResolvedValue(null);
      await updateMangaStatus(1, 'CURRENT', 10);
      expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it('throws error when auth check passes but no auth data', async () => {
      (getAuthData as jest.Mock)
        .mockResolvedValueOnce({ accessToken: 'token', expiresAt: Date.now() + 10000 })
        .mockResolvedValueOnce(null);

      await expect(updateMangaStatus(1, 'CURRENT', 10)).rejects.toThrow(
        'User not authenticated'
      );
    });

    it('throws error on API error', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'abc',
        expiresAt: Date.now() + 1000,
      });

      (globalThis.fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({ errors: [{ message: 'Rate limited' }] }),
        ok: true,
      });

      await expect(updateMangaStatus(1, 'CURRENT', 10)).rejects.toThrow(
        'Rate limited'
      );
    });
  });

  describe('updateAniListStatus', () => {
    it('updates AniList status end to end', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'token',
        expiresAt: Date.now() + 1000,
      });

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: { Media: { id: 7, title: {} } } }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: { SaveMediaListEntry: {} } }),
          ok: true,
        });

      const result = await updateAniListStatus('Title', 'Read', ['1', '2'], 2);

      expect(result.success).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledTimes(2);
      const secondCall = (globalThis.fetch as jest.Mock).mock.calls[1][1];
      expect(secondCall.body).toContain('SaveMediaListEntry');
    });

    it('returns informative message when not logged in to AniList', async () => {
      (getAuthData as jest.Mock).mockResolvedValue(null);
      const result = await updateAniListStatus('Title', 'Reading', [], 0);
      expect(result.success).toBe(false);
      expect(result.message).toContain('User is not logged in');
    });

    it('returns failure when manga not found on AniList', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'token',
        expiresAt: Date.now() + 1000,
      });

      (globalThis.fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({ data: { Media: null } }),
        ok: true,
      });

      const result = await updateAniListStatus('Unknown Manga', 'Reading', [], 0);

      expect(result.success).toBe(false);
      expect(result.message).toContain('was not found on AniList');
    });

    it('maps To Read status to PLANNING', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'token',
        expiresAt: Date.now() + 1000,
      });

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: { Media: { id: 1 } } }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: { SaveMediaListEntry: {} } }),
          ok: true,
        });

      await updateAniListStatus('Title', 'To Read', [], 10);

      const secondCall = (globalThis.fetch as jest.Mock).mock.calls[1][1];
      expect(secondCall.body).toContain('PLANNING');
    });

    it('returns failure message on error', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'token',
        expiresAt: Date.now() + 1000,
      });

      (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await updateAniListStatus('Title', 'Reading', [], 0);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Error updating AniList status');
    });
  });

  describe('syncAllMangaWithAniList', () => {
    it('syncs all bookmarked manga with AniList', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'token',
        expiresAt: Date.now() + 100000,
      });

      await AsyncStorage.setItem(
        'bookmarkKeys',
        JSON.stringify(['bookmark_manga1', 'bookmark_manga2'])
      );

      (getMangaData as jest.Mock)
        .mockResolvedValueOnce({
          id: 'manga1',
          title: 'Manga One',
          bookmarkStatus: 'Reading',
          readChapters: ['1', '2'],
        })
        .mockResolvedValueOnce({
          id: 'manga2',
          title: 'Manga Two',
          bookmarkStatus: 'Read',
          readChapters: ['1', '2', '3'],
        });

      (globalThis.fetch as jest.Mock)
        // Search for Manga One
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: { Media: { id: 100 } } }),
          ok: true,
        })
        // Update Manga One
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: { SaveMediaListEntry: {} } }),
          ok: true,
        })
        // Search for Manga Two
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: { Media: { id: 200 } } }),
          ok: true,
        })
        // Update Manga Two
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: { SaveMediaListEntry: {} } }),
          ok: true,
        });

      (mapping.saveMangaMapping as jest.Mock).mockResolvedValue(undefined);

      const results = await syncAllMangaWithAniList();

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toContain('2 succeeded');
    });

    it('throws error when not logged in', async () => {
      (getAuthData as jest.Mock).mockResolvedValue(null);

      await expect(syncAllMangaWithAniList()).rejects.toThrow(
        'User is not logged in to AniList'
      );
    });

    it('returns message when no bookmarks found', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'token',
        expiresAt: Date.now() + 10000,
      });

      // No bookmarkKeys in AsyncStorage

      const results = await syncAllMangaWithAniList();

      expect(results).toEqual(['No bookmarked manga found']);
    });

    it('skips manga without title or status', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'token',
        expiresAt: Date.now() + 100000,
      });

      await AsyncStorage.setItem(
        'bookmarkKeys',
        JSON.stringify(['bookmark_incomplete'])
      );

      (getMangaData as jest.Mock).mockResolvedValue({
        id: 'incomplete',
        // Missing title and bookmarkStatus
      });

      const results = await syncAllMangaWithAniList();

      expect(results.some((r: string) => r.includes('Skipped'))).toBe(true);
    });

    it('handles manga not found on AniList during sync', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'token',
        expiresAt: Date.now() + 100000,
      });

      await AsyncStorage.setItem(
        'bookmarkKeys',
        JSON.stringify(['bookmark_notfound'])
      );

      (getMangaData as jest.Mock).mockResolvedValue({
        id: 'notfound',
        title: 'Unknown Manga',
        bookmarkStatus: 'Reading',
        readChapters: [],
      });

      (globalThis.fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({ data: { Media: null } }),
        ok: true,
      });

      const results = await syncAllMangaWithAniList();

      expect(results.some((r: string) => r.includes('not found on AniList'))).toBe(true);
    });

    it('handles On Hold status mapping', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'token',
        expiresAt: Date.now() + 100000,
      });

      await AsyncStorage.setItem(
        'bookmarkKeys',
        JSON.stringify(['bookmark_onhold'])
      );

      (getMangaData as jest.Mock).mockResolvedValue({
        id: 'onhold',
        title: 'On Hold Manga',
        bookmarkStatus: 'On Hold',
        readChapters: ['1'],
      });

      (globalThis.fetch as jest.Mock)
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: { Media: { id: 300 } } }),
          ok: true,
        })
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: { SaveMediaListEntry: {} } }),
          ok: true,
        });

      (mapping.saveMangaMapping as jest.Mock).mockResolvedValue(undefined);

      const results = await syncAllMangaWithAniList();

      expect(results.some((r: string) => r.includes('PAUSED'))).toBe(true);
    });

    it('handles errors during individual manga sync', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'token',
        expiresAt: Date.now() + 100000,
      });

      await AsyncStorage.setItem(
        'bookmarkKeys',
        JSON.stringify(['bookmark_error'])
      );

      (getMangaData as jest.Mock).mockResolvedValue({
        id: 'error',
        title: 'Error Manga',
        bookmarkStatus: 'Reading',
        readChapters: [],
      });

      (globalThis.fetch as jest.Mock).mockRejectedValue(new Error('API Error'));

      const results = await syncAllMangaWithAniList();

      expect(results.some((r: string) => r.includes('Failed'))).toBe(true);
    });

    it('retries search when manga not found initially', async () => {
      (getAuthData as jest.Mock).mockResolvedValue({
        accessToken: 'token',
        expiresAt: Date.now() + 100000,
      });

      await AsyncStorage.setItem(
        'bookmarkKeys',
        JSON.stringify(['bookmark_retry'])
      );

      (getMangaData as jest.Mock).mockResolvedValue({
        id: 'retry',
        title: 'Retry Manga',
        bookmarkStatus: 'Reading',
        readChapters: [],
      });

      (globalThis.fetch as jest.Mock)
        // First attempt returns null
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: { Media: null } }),
          ok: true,
        })
        // Second attempt returns null
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: { Media: null } }),
          ok: true,
        })
        // Third attempt also returns null
        .mockResolvedValueOnce({
          json: () => Promise.resolve({ data: { Media: null } }),
          ok: true,
        });

      const results = await syncAllMangaWithAniList();

      // Should have tried multiple times
      expect(globalThis.fetch).toHaveBeenCalledTimes(3);
      expect(results.some((r: string) => r.includes('not found on AniList'))).toBe(true);
    });
  });
});
