import AsyncStorage from '@react-native-async-storage/async-storage';

// Note: offlineCacheService is mocked in jest.setup.ts
// This test file tests the ACTUAL implementation, so we need to unmock it
jest.unmock('@/services/offlineCacheService');

// Mock the image cache
jest.mock('@/services/CacheImages', () => ({
  imageCache: {
    getCachedImagePath: jest.fn().mockResolvedValue('/cached/path/image.jpg'),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { offlineCacheService } from '../offlineCacheService';
import type { MangaDetails, MangaItem } from '@/types';

describe('offlineCacheService', () => {
  const mockMangaDetails: MangaDetails = {
    id: 'manga-1',
    title: 'Test Manga',
    alternativeTitle: 'Test Manga Alt',
    bannerImage: 'https://example.com/banner.jpg',
    description: 'A test manga description',
    status: 'Ongoing',
    author: ['Test Author'],
    published: '2024',
    genres: ['Action', 'Adventure'],
    rating: '4.5',
    reviewCount: '100',
    chapters: [
      { number: '1', title: 'Chapter 1', url: '/ch/1', date: '2024-01-01' },
      { number: '2', title: 'Chapter 2', url: '/ch/2', date: '2024-01-02' },
    ],
  };

  const mockMangaItem: MangaItem = {
    id: 'manga-1',
    title: 'Test Manga',
    banner: 'https://example.com/banner.jpg',
    imageUrl: 'https://example.com/cover.jpg',
    link: '/manga/manga-1',
    type: 'Manga',
  };

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  describe('Manga Details Caching', () => {
    it('caches manga details', async () => {
      await offlineCacheService.cacheMangaDetails(
        'manga-1',
        mockMangaDetails,
        true
      );

      const cached = await offlineCacheService.getCachedMangaDetails('manga-1');

      expect(cached).not.toBeNull();
      expect(cached?.title).toBe('Test Manga');
      expect(cached?.isBookmarked).toBe(true);
      expect(cached?.cachedAt).toBeDefined();
    });

    it('returns null for non-existent manga', async () => {
      const cached =
        await offlineCacheService.getCachedMangaDetails('non-existent');

      expect(cached).toBeNull();
    });

    it('updates existing cached manga', async () => {
      await offlineCacheService.cacheMangaDetails(
        'manga-1',
        mockMangaDetails,
        false
      );

      const updatedDetails = { ...mockMangaDetails, title: 'Updated Title' };
      await offlineCacheService.cacheMangaDetails(
        'manga-1',
        updatedDetails,
        true
      );

      const cached = await offlineCacheService.getCachedMangaDetails('manga-1');

      expect(cached?.title).toBe('Updated Title');
      expect(cached?.isBookmarked).toBe(true);
    });

    it('gets all cached manga details', async () => {
      await offlineCacheService.cacheMangaDetails(
        'manga-1',
        mockMangaDetails,
        true
      );
      await offlineCacheService.cacheMangaDetails(
        'manga-2',
        {
          ...mockMangaDetails,
          id: 'manga-2',
          title: 'Second Manga',
        },
        false
      );

      const allCached = await offlineCacheService.getAllCachedMangaDetails();

      expect(Object.keys(allCached)).toHaveLength(2);
      expect(allCached['manga-1']?.title).toBe('Test Manga');
      expect(allCached['manga-2']?.title).toBe('Second Manga');
    });

    it('gets only bookmarked manga details', async () => {
      await offlineCacheService.cacheMangaDetails(
        'manga-1',
        mockMangaDetails,
        true
      );
      await offlineCacheService.cacheMangaDetails(
        'manga-2',
        {
          ...mockMangaDetails,
          id: 'manga-2',
        },
        false
      );
      await offlineCacheService.cacheMangaDetails(
        'manga-3',
        {
          ...mockMangaDetails,
          id: 'manga-3',
        },
        true
      );

      const bookmarked = await offlineCacheService.getBookmarkedMangaDetails();

      expect(bookmarked).toHaveLength(2);
      expect(bookmarked.map((m) => m.id).sort()).toEqual([
        'manga-1',
        'manga-3',
      ]);
    });

    it('removes manga from cache', async () => {
      await offlineCacheService.cacheMangaDetails(
        'manga-1',
        mockMangaDetails,
        true
      );

      let cached = await offlineCacheService.getCachedMangaDetails('manga-1');
      expect(cached).not.toBeNull();

      await offlineCacheService.removeMangaFromCache('manga-1');

      cached = await offlineCacheService.getCachedMangaDetails('manga-1');
      expect(cached).toBeNull();
    });

    it('updates bookmark status', async () => {
      await offlineCacheService.cacheMangaDetails(
        'manga-1',
        mockMangaDetails,
        true
      );

      await offlineCacheService.updateMangaBookmarkStatus('manga-1', false);

      const cached = await offlineCacheService.getCachedMangaDetails('manga-1');
      expect(cached?.isBookmarked).toBe(false);
    });

    it('handles updating non-existent manga bookmark status', async () => {
      // Should not throw
      await offlineCacheService.updateMangaBookmarkStatus('non-existent', true);

      const cached =
        await offlineCacheService.getCachedMangaDetails('non-existent');
      expect(cached).toBeNull();
    });
  });

  describe('Search Results Caching', () => {
    it('caches search results', async () => {
      const results = [mockMangaItem, { ...mockMangaItem, id: 'manga-2' }];

      await offlineCacheService.cacheSearchResults('test query', results);

      const cached =
        await offlineCacheService.getCachedSearchResults('test query');

      expect(cached).not.toBeNull();
      expect(cached?.query).toBe('test query');
      expect(cached?.results).toHaveLength(2);
    });

    it('normalizes search queries', async () => {
      const results = [mockMangaItem];

      await offlineCacheService.cacheSearchResults('  TEST Query  ', results);

      const cached =
        await offlineCacheService.getCachedSearchResults('test query');

      expect(cached).not.toBeNull();
      expect(cached?.query).toBe('test query');
    });

    it('returns null for non-cached search', async () => {
      const cached =
        await offlineCacheService.getCachedSearchResults('unknown');

      expect(cached).toBeNull();
    });

    it('limits cached searches to 10', async () => {
      // Cache 12 different searches
      for (let i = 0; i < 12; i++) {
        await offlineCacheService.cacheSearchResults(`query-${i}`, [
          mockMangaItem,
        ]);
      }

      const allCached = await offlineCacheService.getAllCachedSearchResults();

      expect(Object.keys(allCached).length).toBeLessThanOrEqual(10);
    });

    it('keeps most recent searches when limiting', async () => {
      // Mock Date.now to return incrementing values to ensure deterministic ordering
      let mockTime = 1000000;
      jest.spyOn(Date, 'now').mockImplementation(() => mockTime++);

      try {
        // Cache 12 searches - each will get a unique, incrementing timestamp
        for (let i = 0; i < 12; i++) {
          await offlineCacheService.cacheSearchResults(`query-${i}`, [
            mockMangaItem,
          ]);
        }

        // The most recent search should still be cached
        const recentCached =
          await offlineCacheService.getCachedSearchResults('query-11');
        expect(recentCached).not.toBeNull();
      } finally {
        // Restore original Date.now
        jest.spyOn(Date, 'now').mockRestore();
      }
    });
  });

  describe('Home Data Caching', () => {
    it('caches home data', async () => {
      const mostViewed = [mockMangaItem];
      const newReleases = [{ ...mockMangaItem, id: 'manga-2' }];
      const featured = { ...mockMangaItem, id: 'featured' };

      await offlineCacheService.cacheHomeData(
        mostViewed,
        newReleases,
        featured
      );

      const cached = await offlineCacheService.getCachedHomeData();

      expect(cached).not.toBeNull();
      expect(cached?.mostViewed).toHaveLength(1);
      expect(cached?.newReleases).toHaveLength(1);
      expect(cached?.featuredManga?.id).toBe('featured');
      expect(cached?.cachedAt).toBeDefined();
    });

    it('caches home data without featured manga', async () => {
      await offlineCacheService.cacheHomeData([mockMangaItem], [], null);

      const cached = await offlineCacheService.getCachedHomeData();

      expect(cached?.featuredManga).toBeNull();
    });

    it('returns null when no home data cached', async () => {
      const cached = await offlineCacheService.getCachedHomeData();

      expect(cached).toBeNull();
    });
  });

  describe('Utility Methods', () => {
    it('clears all cache', async () => {
      await offlineCacheService.cacheMangaDetails(
        'manga-1',
        mockMangaDetails,
        true
      );
      await offlineCacheService.cacheSearchResults('query', [mockMangaItem]);
      await offlineCacheService.cacheHomeData([mockMangaItem], [], null);

      await offlineCacheService.clearAllCache();

      const mangaCache =
        await offlineCacheService.getCachedMangaDetails('manga-1');
      const searchCache =
        await offlineCacheService.getCachedSearchResults('query');
      const homeCache = await offlineCacheService.getCachedHomeData();

      expect(mangaCache).toBeNull();
      expect(searchCache).toBeNull();
      expect(homeCache).toBeNull();
    });

    it('returns cache stats', async () => {
      await offlineCacheService.cacheMangaDetails(
        'manga-1',
        mockMangaDetails,
        true
      );
      await offlineCacheService.cacheMangaDetails(
        'manga-2',
        mockMangaDetails,
        false
      );
      await offlineCacheService.cacheSearchResults('query1', [mockMangaItem]);
      await offlineCacheService.cacheSearchResults('query2', [mockMangaItem]);
      await offlineCacheService.cacheHomeData([mockMangaItem], [], null);

      const stats = await offlineCacheService.getCacheStats();

      expect(stats.mangaCount).toBe(2);
      expect(stats.bookmarkedCount).toBe(1);
      expect(stats.searchQueriesCount).toBe(2);
      expect(stats.hasHomeData).toBe(true);
      expect(stats.totalSizeEstimate).toBeDefined();
    });

    it('returns empty stats when no cache', async () => {
      const stats = await offlineCacheService.getCacheStats();

      expect(stats.mangaCount).toBe(0);
      expect(stats.bookmarkedCount).toBe(0);
      expect(stats.searchQueriesCount).toBe(0);
      expect(stats.hasHomeData).toBe(false);
      // Empty objects still have some bytes when stringified
      expect(stats.totalSizeEstimate).toBeDefined();
    });

    it('formats bytes correctly in stats', async () => {
      // Cache some data to get non-zero size
      await offlineCacheService.cacheMangaDetails(
        'manga-1',
        mockMangaDetails,
        true
      );

      const stats = await offlineCacheService.getCacheStats();

      // Should have some size estimate
      expect(stats.totalSizeEstimate).toMatch(/\d+(\.\d+)?\s*(B|KB|MB|GB)/);
    });
  });

  describe('Error Handling', () => {
    it('handles AsyncStorage errors gracefully for getMangaDetails', async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      const cached = await offlineCacheService.getCachedMangaDetails('manga-1');

      expect(cached).toBeNull();
    });

    it('handles AsyncStorage errors gracefully for getAllCachedMangaDetails', async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      const cached = await offlineCacheService.getAllCachedMangaDetails();

      expect(cached).toEqual({});
    });

    it('handles AsyncStorage errors gracefully for getBookmarkedMangaDetails', async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      const cached = await offlineCacheService.getBookmarkedMangaDetails();

      expect(cached).toEqual([]);
    });

    it('handles AsyncStorage errors gracefully for getCacheStats', async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      const stats = await offlineCacheService.getCacheStats();

      expect(stats).toEqual({
        mangaCount: 0,
        bookmarkedCount: 0,
        searchQueriesCount: 0,
        hasHomeData: false,
        totalSizeEstimate: '4 B',
      });
    });
  });
});
