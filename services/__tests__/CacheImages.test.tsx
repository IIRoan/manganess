import { renderHook, waitFor } from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock the file system module
const mockFiles = new Map<string, { exists: boolean; size: number }>();
let mockDownloadError: Error | null = null;

jest.mock('expo-file-system', () => {
  class MockDirectory {
    path: string;
    exists = true;
    constructor(parent: any, name?: string) {
      this.path = name ? `${parent.path ?? parent}/${name}` : parent;
    }
    async create() {
      this.exists = true;
    }
    delete() {
      this.exists = false;
      // Remove all files in this directory
      for (const key of mockFiles.keys()) {
        if (key.startsWith(this.path)) {
          mockFiles.delete(key);
        }
      }
    }
  }

  class MockFile {
    uri: string;
    exists: boolean = false;
    size: number = 64;
    constructor(dirOrPath: any, name?: string) {
      this.uri = name ? `${dirOrPath.path ?? dirOrPath}/${name}` : dirOrPath;
      const fileData = mockFiles.get(this.uri);
      if (fileData) {
        this.exists = fileData.exists;
        this.size = fileData.size;
      }
    }
    info() {
      const fileData = mockFiles.get(this.uri);
      return {
        exists: fileData?.exists ?? this.exists,
        size: fileData?.size ?? this.size,
      };
    }
    delete() {
      this.exists = false;
      mockFiles.delete(this.uri);
    }
    static async downloadFileAsync(_url: string, file: MockFile) {
      if (mockDownloadError) {
        throw mockDownloadError;
      }
      file.exists = true;
      file.size = 1024;
      mockFiles.set(file.uri, { exists: true, size: 1024 });
      return file;
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { cache: '/cache' },
  };
});

jest.mock('@/constants/env', () => ({
  isDebugEnabled: () => false,
}));

// Reset module cache before importing
beforeEach(() => {
  jest.resetModules();
  mockFiles.clear();
  mockDownloadError = null;
});

import {
  imageCache,
  useImageCache,
  useMangaImageCache,
  useDownloadImageCache,
} from '../CacheImages';

describe('CacheImages', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    mockFiles.clear();
    mockDownloadError = null;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('imageCache singleton', () => {
    it('returns the same instance', () => {
      const { imageCache: cache1 } = require('../CacheImages');
      const { imageCache: cache2 } = require('../CacheImages');
      expect(cache1).toBe(cache2);
    });
  });

  describe('getCachedImagePath', () => {
    it('returns original URL when URL is empty', async () => {
      const result = await imageCache.getCachedImagePath('', 'search');
      expect(result).toBe('');
    });

    it('caches search images', async () => {
      const url = 'https://example.com/image.jpg';
      const result = await imageCache.getCachedImagePath(url, 'search');

      // Should return a cached path or the original URL
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('caches manga images with mangaId', async () => {
      const url = 'https://example.com/manga-cover.jpg';
      const mangaId = 'manga-123';
      const result = await imageCache.getCachedImagePath(
        url,
        'manga',
        mangaId
      );

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('caches download images', async () => {
      const url = 'https://example.com/chapter-image.jpg';
      const mangaId = 'manga-123';
      const result = await imageCache.getCachedImagePath(
        url,
        'download',
        mangaId
      );

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('returns original URL on download error', async () => {
      mockDownloadError = new Error('Network error');
      const url = 'https://example.com/error-image.jpg';
      const result = await imageCache.getCachedImagePath(url, 'search');

      // Should fall back to original URL
      expect(result).toBe(url);
    });
  });

  describe('validateAndUpdateCache', () => {
    it('validates and caches manga image', async () => {
      const mangaId = 'manga-test';
      const url = 'https://example.com/test-cover.jpg';

      const result = await imageCache.validateAndUpdateCache(mangaId, url);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('updates cache when URL changes', async () => {
      const mangaId = 'manga-update';
      const url1 = 'https://example.com/cover-v1.jpg';
      const url2 = 'https://example.com/cover-v2.jpg';

      // Cache first URL
      await imageCache.validateAndUpdateCache(mangaId, url1);

      // Update with new URL
      const result = await imageCache.validateAndUpdateCache(mangaId, url2);

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getCachedMangaImagePath', () => {
    it('returns null when no cached image exists', async () => {
      const result = await imageCache.getCachedMangaImagePath('non-existent');
      expect(result).toBeNull();
    });

    it('returns cached path when image exists', async () => {
      const mangaId = 'cached-manga';
      const url = 'https://example.com/cached.jpg';

      // First cache the image
      await imageCache.validateAndUpdateCache(mangaId, url);

      // Then try to get cached path
      const result = await imageCache.getCachedMangaImagePath(mangaId);

      expect(result).not.toBeNull();
    });
  });

  describe('cacheChapterImage', () => {
    it('caches chapter images with page numbers', async () => {
      const url = 'https://example.com/page1.jpg';
      const mangaId = 'manga-chapter';
      const chapterNumber = '5';
      const pageNumber = 1;

      const result = await imageCache.cacheChapterImage(
        url,
        mangaId,
        chapterNumber,
        pageNumber
      );

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('getChapterImagePath', () => {
    it('returns null when chapter image not cached', async () => {
      const result = await imageCache.getChapterImagePath(
        'unknown-manga',
        '1',
        1
      );
      expect(result).toBeNull();
    });

    it('returns cached path when chapter image exists', async () => {
      const mangaId = 'chapter-manga';
      const chapterNumber = '10';
      const pageNumber = 5;
      const url = 'https://example.com/ch10-page5.jpg';

      // Cache the image first
      await imageCache.cacheChapterImage(
        url,
        mangaId,
        chapterNumber,
        pageNumber
      );

      // Get the cached path
      const result = await imageCache.getChapterImagePath(
        mangaId,
        chapterNumber,
        pageNumber
      );

      expect(result).not.toBeNull();
    });
  });

  describe('deleteChapterCache', () => {
    it('deletes cached chapter images', async () => {
      const mangaId = 'delete-chapter';
      const chapterNumber = '3';

      // Cache some images
      await imageCache.cacheChapterImage(
        'https://example.com/p1.jpg',
        mangaId,
        chapterNumber,
        1
      );
      await imageCache.cacheChapterImage(
        'https://example.com/p2.jpg',
        mangaId,
        chapterNumber,
        2
      );

      // Delete chapter cache
      await imageCache.deleteChapterCache(mangaId, chapterNumber);

      // Verify deletion
      const result = await imageCache.getChapterImagePath(
        mangaId,
        chapterNumber,
        1
      );
      expect(result).toBeNull();
    });
  });

  describe('deleteMangaDownloadCache', () => {
    it('deletes all download cache for a manga', async () => {
      const mangaId = 'delete-manga';

      // Cache images for multiple chapters
      await imageCache.cacheChapterImage(
        'https://example.com/ch1-p1.jpg',
        mangaId,
        '1',
        1
      );
      await imageCache.cacheChapterImage(
        'https://example.com/ch2-p1.jpg',
        mangaId,
        '2',
        1
      );

      // Delete all manga download cache
      await imageCache.deleteMangaDownloadCache(mangaId);

      // Verify deletion
      const result1 = await imageCache.getChapterImagePath(mangaId, '1', 1);
      const result2 = await imageCache.getChapterImagePath(mangaId, '2', 1);

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });

  describe('getDownloadCacheStats', () => {
    it('returns stats for download cache', async () => {
      const stats = await imageCache.getDownloadCacheStats();

      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('totalFiles');
      expect(stats).toHaveProperty('chapterCount');
      expect(typeof stats.totalSize).toBe('number');
      expect(typeof stats.totalFiles).toBe('number');
      expect(typeof stats.chapterCount).toBe('number');
    });

    it('returns stats for specific manga', async () => {
      const mangaId = 'stats-manga';

      // Cache some images
      await imageCache.cacheChapterImage(
        'https://example.com/test.jpg',
        mangaId,
        '1',
        1
      );

      const stats = await imageCache.getDownloadCacheStats(mangaId);

      expect(stats.totalFiles).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getCacheStats', () => {
    it('returns overall cache statistics', async () => {
      const stats = await imageCache.getCacheStats();

      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('totalFiles');
      expect(stats).toHaveProperty('mangaCount');
      expect(stats).toHaveProperty('searchCount');
      expect(stats).toHaveProperty('downloadCount');
      expect(stats).toHaveProperty('oldestEntry');
      expect(stats).toHaveProperty('newestEntry');
    });
  });

  describe('clearCache', () => {
    it('clears all cache when no context specified', async () => {
      // Cache some images
      await imageCache.getCachedImagePath(
        'https://example.com/s1.jpg',
        'search'
      );
      await imageCache.getCachedImagePath(
        'https://example.com/m1.jpg',
        'manga',
        'manga1'
      );

      // Clear all cache
      await imageCache.clearCache();

      const stats = await imageCache.getCacheStats();
      expect(stats.totalFiles).toBe(0);
    });

    it('clears only search cache when context is search', async () => {
      await imageCache.clearCache('search');

      // Should not throw
      expect(true).toBe(true);
    });

    it('clears only manga cache when context is manga', async () => {
      await imageCache.clearCache('manga');

      // Should not throw
      expect(true).toBe(true);
    });

    it('clears only download cache when context is download', async () => {
      await imageCache.clearCache('download');

      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('useImageCache hook', () => {
    it('uses cached image path for generic cache hook', async () => {
      const getCachedSpy = jest
        .spyOn(imageCache, 'getCachedImagePath')
        .mockResolvedValue('cached-uri');

      const { result } = renderHook(() =>
        useImageCache('https://img/test.jpg')
      );

      expect(result.current).toBe('https://img/test.jpg');

      await waitFor(() => {
        expect(result.current).toBe('cached-uri');
      });
      expect(getCachedSpy).toHaveBeenCalledWith(
        'https://img/test.jpg',
        'search',
        undefined
      );
    });

    it('returns original URL when caching fails', async () => {
      jest
        .spyOn(imageCache, 'getCachedImagePath')
        .mockRejectedValue(new Error('Cache error'));

      const { result } = renderHook(() =>
        useImageCache('https://img/error.jpg')
      );

      await waitFor(() => {
        expect(result.current).toBe('https://img/error.jpg');
      });
    });

    it('handles empty URL', async () => {
      const { result } = renderHook(() => useImageCache(''));

      expect(result.current).toBe('');
    });
  });

  describe('useMangaImageCache hook', () => {
    it('validates manga image cache via dedicated hook', async () => {
      const spy = jest
        .spyOn(imageCache, 'validateAndUpdateCache')
        .mockResolvedValue('validated-uri');

      const { result, rerender } = renderHook(
        ({ mangaId, url }: { mangaId: string; url: string }) =>
          useMangaImageCache(mangaId, url),
        { initialProps: { mangaId: 'm1', url: 'https://img/m1.jpg' } }
      );

      expect(result.current).toBe('https://img/m1.jpg');

      await waitFor(() => {
        expect(result.current).toBe('validated-uri');
      });
      expect(spy).toHaveBeenCalledWith('m1', 'https://img/m1.jpg');

      rerender({ mangaId: 'm2', url: 'https://img/m2.jpg' });

      await waitFor(() => {
        expect(spy).toHaveBeenCalledWith('m2', 'https://img/m2.jpg');
      });
    });

    it('uses getCachedMangaImagePath when validation disabled', async () => {
      const getCachedSpy = jest
        .spyOn(imageCache, 'getCachedMangaImagePath')
        .mockResolvedValue('cached-path');

      renderHook(() =>
        useMangaImageCache('m1', 'https://img/m1.jpg', { enabled: false })
      );

      await waitFor(() => {
        expect(getCachedSpy).toHaveBeenCalledWith('m1', 'https://img/m1.jpg');
      });
    });

    it('handles empty mangaId or URL', async () => {
      const { result } = renderHook(() => useMangaImageCache('', ''));

      // Should return original URL
      expect(result.current).toBe('');
    });

    it('returns original URL on validation error', async () => {
      jest
        .spyOn(imageCache, 'validateAndUpdateCache')
        .mockRejectedValue(new Error('Validation error'));

      const { result } = renderHook(() =>
        useMangaImageCache('m1', 'https://img/error.jpg')
      );

      await waitFor(() => {
        expect(result.current).toBe('https://img/error.jpg');
      });
    });
  });

  describe('useDownloadImageCache hook', () => {
    it('caches download images with chapter info', async () => {
      const getChapterSpy = jest
        .spyOn(imageCache, 'getChapterImagePath')
        .mockResolvedValue(null);
      const cacheSpy = jest
        .spyOn(imageCache, 'cacheChapterImage')
        .mockResolvedValue('download-cached-uri');

      const { result } = renderHook(() =>
        useDownloadImageCache('https://img/page.jpg', 'manga1', '5', 3)
      );

      expect(result.current).toBe('https://img/page.jpg');

      await waitFor(() => {
        expect(result.current).toBe('download-cached-uri');
      });

      expect(getChapterSpy).toHaveBeenCalledWith('manga1', '5', 3);
      expect(cacheSpy).toHaveBeenCalledWith(
        'https://img/page.jpg',
        'manga1',
        '5',
        3
      );
    });

    it('returns existing cached path if available', async () => {
      jest
        .spyOn(imageCache, 'getChapterImagePath')
        .mockResolvedValue('existing-path');

      const { result } = renderHook(() =>
        useDownloadImageCache('https://img/page.jpg', 'manga1', '5', 3)
      );

      await waitFor(() => {
        expect(result.current).toBe('existing-path');
      });
    });

    it('handles missing parameters gracefully', async () => {
      const { result } = renderHook(() =>
        useDownloadImageCache('', 'manga1', '', 0)
      );

      expect(result.current).toBe('');
    });

    it('returns original URL on error', async () => {
      jest
        .spyOn(imageCache, 'getChapterImagePath')
        .mockRejectedValue(new Error('Cache error'));

      const { result } = renderHook(() =>
        useDownloadImageCache('https://img/error.jpg', 'manga1', '5', 3)
      );

      await waitFor(() => {
        expect(result.current).toBe('https://img/error.jpg');
      });
    });
  });
});
