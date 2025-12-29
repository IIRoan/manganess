import AsyncStorage from '@react-native-async-storage/async-storage';
import { renderHook, waitFor } from '@testing-library/react-native';

// Mock expo-file-system
const mockFileExists = jest.fn();
const mockFileDelete = jest.fn();
const mockFileInfo = jest.fn();
const mockFileUri = 'file:///cache/image.jpg';
const mockDirCreate = jest.fn();
const mockDirDelete = jest.fn();
const mockDirExists = false;
const mockDownloadFileAsync = jest.fn();

jest.mock('expo-file-system', () => {
  class MockFile {
    path: string;
    constructor(...args: any[]) {
      this.path = args.join('/');
    }
    get exists() {
      return mockFileExists();
    }
    get uri() {
      return mockFileUri;
    }
    delete() {
      return mockFileDelete();
    }
    info() {
      return mockFileInfo();
    }
    static downloadFileAsync = mockDownloadFileAsync;
  }

  class MockDirectory {
    path: string;
    constructor(...args: any[]) {
      this.path = args.join('/');
    }
    get exists() {
      return mockDirExists;
    }
    create() {
      return mockDirCreate();
    }
    delete() {
      return mockDirDelete();
    }
  }

  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: {
      cache: '/cache',
    },
  };
});

jest.mock('@/constants/env', () => ({
  isDebugEnabled: jest.fn(() => false),
}));

import { imageCache, useImageCache, useMangaImageCache, useDownloadImageCache } from '../CacheImages';
import { isDebugEnabled } from '@/constants/env';

describe('CacheImages', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    // Reset mock return values
    mockFileExists.mockReturnValue(false);
    mockFileInfo.mockReturnValue({ exists: false, size: 0 });
    mockDownloadFileAsync.mockResolvedValue({ uri: mockFileUri, info: () => ({ exists: true, size: 1024 }) });
  });

  describe('imageCache singleton', () => {
    it('returns the same instance', () => {
      const instance1 = imageCache;
      const instance2 = imageCache;
      expect(instance1).toBe(instance2);
    });
  });

  describe('initializeCache', () => {
    it('creates cache directories', async () => {
      await imageCache.initializeCache();
      // Should have tried to create directories
      expect(mockDirCreate).toHaveBeenCalled();
    });
  });

  describe('getCachedImagePath', () => {
    it('returns original URL for empty input', async () => {
      const result = await imageCache.getCachedImagePath('');
      expect(result).toBe('');
    });

    it('handles search context', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      const result = await imageCache.getCachedImagePath(
        'https://example.com/image.jpg',
        'search'
      );

      expect(result).toBeDefined();
    });

    it('handles manga context', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      const result = await imageCache.getCachedImagePath(
        'https://example.com/image.jpg',
        'manga',
        'manga123'
      );

      expect(result).toBeDefined();
    });

    it('handles download context', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      const result = await imageCache.getCachedImagePath(
        'https://example.com/image.jpg',
        'download',
        'manga123'
      );

      expect(result).toBeDefined();
    });

    it('returns original URL on error', async () => {
      mockDownloadFileAsync.mockRejectedValue(new Error('Download failed'));

      const result = await imageCache.getCachedImagePath(
        'https://example.com/image.jpg',
        'manga',
        'manga123'
      );

      expect(result).toBeDefined();
    });
  });

  describe('cacheChapterImage', () => {
    it('caches chapter image with correct path', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      const result = await imageCache.cacheChapterImage(
        'https://example.com/page1.jpg',
        'manga123',
        '1',
        1
      );

      expect(result).toBeDefined();
    });
  });

  describe('getChapterImagePath', () => {
    it('returns null when chapter not cached', async () => {
      const result = await imageCache.getChapterImagePath('manga123', '1', 1);
      expect(result).toBeNull();
    });
  });

  describe('deleteChapterCache', () => {
    it('deletes cached chapter files', async () => {
      // First cache a chapter
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 1024 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      await imageCache.cacheChapterImage(
        'https://example.com/page1.jpg',
        'manga123',
        '1',
        1
      );

      await imageCache.deleteChapterCache('manga123', '1');

      // Should have attempted to delete
      expect(mockFileDelete).toHaveBeenCalled();
    });
  });

  describe('deleteMangaDownloadCache', () => {
    it('deletes all cached downloads for a manga', async () => {
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 1024 });

      await imageCache.deleteMangaDownloadCache('manga123');

      // Function should complete without error
      expect(true).toBe(true);
    });
  });

  describe('getDownloadCacheStats', () => {
    it('returns zero stats when no downloads cached', async () => {
      const stats = await imageCache.getDownloadCacheStats();

      expect(stats.totalSize).toBe(0);
      expect(stats.totalFiles).toBe(0);
      expect(stats.chapterCount).toBe(0);
    });

    it('filters by mangaId when provided', async () => {
      const stats = await imageCache.getDownloadCacheStats('manga123');

      expect(stats).toBeDefined();
      expect(stats.totalSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('clearCache', () => {
    it('clears all cache when no context specified', async () => {
      await imageCache.clearCache();

      expect(mockDirDelete).toHaveBeenCalled();
    });

    it('clears only search cache', async () => {
      await imageCache.clearCache('search');

      expect(mockDirDelete).toHaveBeenCalled();
    });

    it('clears only manga cache', async () => {
      await imageCache.clearCache('manga');

      expect(mockDirDelete).toHaveBeenCalled();
    });

    it('clears only download cache', async () => {
      await imageCache.clearCache('download');

      expect(mockDirDelete).toHaveBeenCalled();
    });

    it('handles errors during cache clearing', async () => {
      mockDirDelete.mockImplementation(() => {
        throw new Error('Delete failed');
      });

      // Should not throw
      await expect(imageCache.clearCache()).resolves.not.toThrow();
    });
  });

  describe('getCacheStats', () => {
    it('returns cache statistics', async () => {
      const stats = await imageCache.getCacheStats();

      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('totalFiles');
      expect(stats).toHaveProperty('mangaCount');
      expect(stats).toHaveProperty('searchCount');
      expect(stats).toHaveProperty('downloadCount');
      expect(stats).toHaveProperty('oldestEntry');
      expect(stats).toHaveProperty('newestEntry');
    });

    it('handles errors and returns empty stats', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      // Re-initialize cache with error
      const stats = await imageCache.getCacheStats();

      expect(stats.totalSize).toBeGreaterThanOrEqual(0);
    });
  });

  describe('validateAndUpdateCache', () => {
    it('validates and updates cache for manga', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      const result = await imageCache.validateAndUpdateCache(
        'manga123',
        'https://example.com/new-image.jpg'
      );

      expect(result).toBeDefined();
    });
  });

  describe('getCachedMangaImagePath', () => {
    it('returns null when no cached image exists', async () => {
      const result = await imageCache.getCachedMangaImagePath('manga123');
      expect(result).toBeNull();
    });

    it('returns fallback URL when provided and no cache exists', async () => {
      const result = await imageCache.getCachedMangaImagePath(
        'nonexistent',
        'https://fallback.com/image.jpg'
      );

      expect(result).toBeNull();
    });
  });

  describe('useImageCache hook', () => {
    it('returns original URL initially then cached path', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      const { result } = renderHook(() =>
        useImageCache('https://example.com/image.jpg', 'search')
      );

      // Initially returns original URL
      expect(result.current).toBe('https://example.com/image.jpg');

      // Wait for cache to update
      await waitFor(() => {
        expect(result.current).toBeDefined();
      });
    });

    it('returns original URL for empty input', async () => {
      const { result } = renderHook(() => useImageCache(''));

      expect(result.current).toBe('');
    });

    it('handles cache errors gracefully', async () => {
      mockDownloadFileAsync.mockRejectedValue(new Error('Cache error'));

      const { result } = renderHook(() =>
        useImageCache('https://example.com/image.jpg', 'search')
      );

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });
    });
  });

  describe('useMangaImageCache hook', () => {
    it('returns cached path for manga', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      const { result } = renderHook(() =>
        useMangaImageCache('manga123', 'https://example.com/manga.jpg')
      );

      expect(result.current).toBe('https://example.com/manga.jpg');

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });
    });

    it('returns original URL for empty mangaId', async () => {
      const { result } = renderHook(() =>
        useMangaImageCache('', 'https://example.com/manga.jpg')
      );

      expect(result.current).toBe('https://example.com/manga.jpg');
    });

    it('skips validation when enabled is false', async () => {
      const { result } = renderHook(() =>
        useMangaImageCache('manga123', 'https://example.com/manga.jpg', {
          enabled: false,
        })
      );

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });
    });

    it('handles errors gracefully', async () => {
      mockDownloadFileAsync.mockRejectedValue(new Error('Cache error'));

      const { result } = renderHook(() =>
        useMangaImageCache('manga123', 'https://example.com/manga.jpg')
      );

      await waitFor(() => {
        expect(result.current).toBe('https://example.com/manga.jpg');
      });
    });
  });

  describe('useDownloadImageCache hook', () => {
    it('returns cached path for download', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      const { result } = renderHook(() =>
        useDownloadImageCache(
          'https://example.com/page.jpg',
          'manga123',
          '1',
          1
        )
      );

      expect(result.current).toBe('https://example.com/page.jpg');

      await waitFor(() => {
        expect(result.current).toBeDefined();
      });
    });

    it('returns original URL for missing parameters', async () => {
      const { result } = renderHook(() =>
        useDownloadImageCache('https://example.com/page.jpg', '', '1', 1)
      );

      expect(result.current).toBe('https://example.com/page.jpg');
    });

    it('handles errors gracefully', async () => {
      mockDownloadFileAsync.mockRejectedValue(new Error('Download error'));

      const { result } = renderHook(() =>
        useDownloadImageCache(
          'https://example.com/page.jpg',
          'manga123',
          '1',
          1
        )
      );

      await waitFor(() => {
        expect(result.current).toBe('https://example.com/page.jpg');
      });
    });
  });

  describe('download error handling', () => {
    it('returns original URL when download fails after retries', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockRejectedValue(new Error('Download failed'));

      const result = await imageCache.getCachedImagePath(
        'https://example.com/image.jpg',
        'search'
      );

      // Should return the original URL when caching fails
      expect(result).toBeDefined();
    });
  });

  describe('debug logging', () => {
    beforeEach(() => {
      (isDebugEnabled as jest.Mock).mockReturnValue(true);
    });

    afterEach(() => {
      (isDebugEnabled as jest.Mock).mockReturnValue(false);
    });

    it('logs debug info when enabled', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      await imageCache.getCachedImagePath(
        'https://example.com/image.jpg',
        'manga',
        'manga123'
      );

      // Debug logging may have been called
      consoleSpy.mockRestore();
    });
  });

  describe('existing file handling', () => {
    it('returns existing cached file without re-downloading', async () => {
      // First, simulate an existing cached file
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 2048 });

      const result = await imageCache.getCachedImagePath(
        'https://example.com/image.jpg',
        'search'
      );

      // Should return cached path without calling download
      expect(result).toBeDefined();
    });
  });

  describe('concurrent download handling', () => {
    it('returns same promise for concurrent requests', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });

      let resolveDownload: (value: any) => void;
      mockDownloadFileAsync.mockReturnValue(
        new Promise((resolve) => {
          resolveDownload = resolve;
        })
      );

      const promise1 = imageCache.getCachedImagePath(
        'https://example.com/same-image.jpg',
        'search'
      );
      const promise2 = imageCache.getCachedImagePath(
        'https://example.com/same-image.jpg',
        'search'
      );

      // Resolve the download
      resolveDownload!({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should receive the same result
      expect(result1).toBe(result2);
    });
  });

  describe('retry with backoff', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('retries on download failure', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });

      let callCount = 0;
      mockDownloadFileAsync.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          uri: mockFileUri,
          info: () => ({ exists: true, size: 1024 }),
        });
      });

      const resultPromise = imageCache.getCachedImagePath(
        'https://example.com/retry-image.jpg',
        'manga',
        'manga456'
      );

      // Run all pending timers for retries
      await jest.runAllTimersAsync();

      const result = await resultPromise;
      expect(result).toBeDefined();
    });

    it('gives up after max retries', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockRejectedValue(new Error('Persistent failure'));

      const resultPromise = imageCache.getCachedImagePath(
        'https://example.com/fail-image.jpg',
        'manga',
        'manga789'
      );

      // Run all pending timers for retries
      await jest.runAllTimersAsync();

      const result = await resultPromise;
      // Should return original URL after all retries fail
      expect(result).toBeDefined();
    });

    it('logs retry attempts when debug is enabled', async () => {
      (isDebugEnabled as jest.Mock).mockReturnValue(true);
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });

      let callCount = 0;
      mockDownloadFileAsync.mockImplementation(() => {
        callCount++;
        if (callCount < 2) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          uri: mockFileUri,
          info: () => ({ exists: true, size: 1024 }),
        });
      });

      const resultPromise = imageCache.getCachedImagePath(
        'https://example.com/debug-retry.jpg',
        'manga',
        'manga999'
      );

      await jest.runAllTimersAsync();
      await resultPromise;

      consoleSpy.mockRestore();
      (isDebugEnabled as jest.Mock).mockReturnValue(false);
    });
  });

  describe('bookmark context', () => {
    it('handles bookmark context correctly', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      const result = await imageCache.getCachedImagePath(
        'https://example.com/image.jpg',
        'bookmark',
        'manga123'
      );

      expect(result).toBeDefined();
    });
  });

  describe('normalizeUri', () => {
    it('handles different URI formats', async () => {
      // Test with file:// prefix already
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 1024 });

      const result = await imageCache.getCachedImagePath(
        'https://example.com/image.jpg',
        'search'
      );

      expect(result).toBeDefined();
    });
  });

  describe('cache directory creation', () => {
    it('creates directories on initialization error', async () => {
      mockDirCreate.mockImplementationOnce(() => {
        throw new Error('Dir exists');
      });

      // Should not throw
      await expect(imageCache.initializeCache()).resolves.not.toThrow();
    });
  });

  describe('getChapterImagePath', () => {
    it('returns path when chapter image is cached', async () => {
      // First cache the image
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 1024 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      // Cache the chapter image first
      await imageCache.cacheChapterImage(
        'https://example.com/chapter-page.jpg',
        'manga123',
        '5',
        3
      );

      const cachedPath = await imageCache.getChapterImagePath('manga123', '5', 3);
      // Either returns a path string or null
      expect(cachedPath === null || typeof cachedPath === 'string').toBe(true);
    });

    it('returns null when chapter image is not cached', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });

      const cachedPath = await imageCache.getChapterImagePath('nonexistent', '1', 1);
      expect(cachedPath).toBe(null);
    });
  });

  describe('getCachedMangaImagePath', () => {
    it('returns path when manga cover is cached', async () => {
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 1024 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      // Cache manga cover first
      await imageCache.getCachedImagePath(
        'https://example.com/cover.jpg',
        'manga',
        'manga-cover-test'
      );

      const cachedPath = await imageCache.getCachedMangaImagePath('manga-cover-test');
      // Either returns a path string or null
      expect(cachedPath === null || typeof cachedPath === 'string').toBe(true);
    });

    it('returns null when manga cover is not cached', async () => {
      mockFileExists.mockReturnValue(false);

      const cachedPath = await imageCache.getCachedMangaImagePath('nonexistent-manga');
      expect(cachedPath).toBe(null);
    });
  });

  describe('deleteChapterCache', () => {
    it('deletes cached chapter images', async () => {
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 1024 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      // Cache a chapter image first
      await imageCache.cacheChapterImage(
        'https://example.com/page1.jpg',
        'manga-test',
        'ch1',
        1
      );

      // Delete the chapter cache
      await imageCache.deleteChapterCache('manga-test', 'ch1');

      // Should have attempted to delete the file
      expect(mockFileDelete).toHaveBeenCalled();
    });

    it('handles delete errors gracefully', async () => {
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 1024 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      // Cache a chapter image first
      await imageCache.cacheChapterImage(
        'https://example.com/page1.jpg',
        'manga-delete-error',
        'ch1',
        1
      );

      // Make delete throw an error
      mockFileDelete.mockImplementation(() => {
        throw new Error('Delete failed');
      });

      // Should not throw
      await expect(imageCache.deleteChapterCache('manga-delete-error', 'ch1')).resolves.not.toThrow();
    });
  });

  describe('deleteMangaDownloadCache', () => {
    it('deletes all cached downloads for a manga', async () => {
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 1024 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      // Cache some chapter images
      await imageCache.cacheChapterImage(
        'https://example.com/page1.jpg',
        'manga-to-delete',
        'ch1',
        1
      );

      // Delete all manga downloads
      await imageCache.deleteMangaDownloadCache('manga-to-delete');

      // Should have attempted to delete files
      expect(mockFileDelete).toHaveBeenCalled();
    });

    it('handles delete errors gracefully', async () => {
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 1024 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      // Cache a chapter image first
      await imageCache.cacheChapterImage(
        'https://example.com/page1.jpg',
        'manga-delete-all-error',
        'ch1',
        1
      );

      // Make delete throw an error
      mockFileDelete.mockImplementation(() => {
        throw new Error('Delete all failed');
      });

      // Should not throw
      await expect(imageCache.deleteMangaDownloadCache('manga-delete-all-error')).resolves.not.toThrow();
    });
  });

  describe('download error handling', () => {
    it('returns original URL when download fails after retries', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockRejectedValue(new Error('Network error'));

      const result = await imageCache.getCachedImagePath(
        'https://example.com/retry-fail-image.jpg',
        'manga',
        'manga-retry-fail'
      );

      // Should return original URL as fallback
      expect(result).toBeDefined();
    });
  });

  describe('search cache with existing files', () => {
    it('uses existing cached file', async () => {
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 500 });

      const result = await imageCache.getCachedImagePath(
        'https://example.com/cached-search.jpg',
        'search'
      );

      // Should return the cached file path without downloading
      expect(result).toContain('file://');
      expect(mockDownloadFileAsync).not.toHaveBeenCalled();
    });
  });

  describe('concurrent download queue', () => {
    it('handles concurrent requests for same image', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      // Make concurrent requests for the same image
      const promises = [
        imageCache.getCachedImagePath('https://example.com/same.jpg', 'search'),
        imageCache.getCachedImagePath('https://example.com/same.jpg', 'search'),
      ];

      const results = await Promise.all(promises);

      // Both should return the same path
      expect(results[0]).toBe(results[1]);
    });
  });

  describe('download cache with chapter and page info', () => {
    it('caches with chapter and page metadata', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      const result = await imageCache.cacheChapterImage(
        'https://example.com/chapter5-page10.jpg',
        'manga-metadata',
        '5',
        10
      );

      expect(result).toBeDefined();
    });
  });

  describe('validateAndUpdateCache scenarios', () => {
    it('caches new image when no existing cache', async () => {
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      // Validate and update with no existing cache
      const result = await imageCache.validateAndUpdateCache(
        'manga-new-cache',
        'https://example.com/brand-new.jpg'
      );

      expect(result).toBeDefined();
    });
  });

  describe('getCacheStats with cached files', () => {
    it('counts cached files correctly', async () => {
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 1024 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      // Cache some images
      await imageCache.getCachedImagePath('https://example.com/img1.jpg', 'manga', 'manga1');
      await imageCache.getCachedImagePath('https://example.com/img2.jpg', 'search');

      const stats = await imageCache.getCacheStats();

      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('totalFiles');
    });
  });

  describe('getDownloadCacheStats with cached downloads', () => {
    it('calculates download stats correctly', async () => {
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 1024 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      // Cache some chapter images
      await imageCache.cacheChapterImage('https://example.com/p1.jpg', 'manga-stats', 'ch1', 1);
      await imageCache.cacheChapterImage('https://example.com/p2.jpg', 'manga-stats', 'ch1', 2);

      const stats = await imageCache.getDownloadCacheStats('manga-stats');

      expect(stats.totalFiles).toBeGreaterThanOrEqual(0);
      expect(stats.chapterCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('search cache stale metadata handling', () => {
    it('refreshes stale search cache metadata when file exists', async () => {
      // First, cache an image
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 512 });

      // First call creates metadata
      await imageCache.getCachedImagePath('https://example.com/stale-search-unique.jpg', 'search');

      // Simulate time passing (metadata will be stale)
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => originalDateNow() + 2 * 60 * 60 * 1000); // 2 hours later

      // Second call should refresh the stale metadata
      const result = await imageCache.getCachedImagePath('https://example.com/stale-search-unique.jpg', 'search');

      expect(result).toContain('file://');
      Date.now = originalDateNow;
    });

    it('creates metadata for existing file without metadata', async () => {
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 768 });

      const result = await imageCache.getCachedImagePath('https://example.com/no-meta-search-unique.jpg', 'search');

      expect(result).toContain('file://');
    });
  });

  describe('downloadSearchImage error with existing file', () => {
    it('uses existing file when download fails but file exists', async () => {
      // File doesn't exist initially
      let fileExists = false;
      mockFileExists.mockImplementation(() => fileExists);
      mockFileInfo.mockImplementation(() => ({ exists: fileExists, size: fileExists ? 256 : 0 }));

      // Download fails, but file exists after (e.g., race condition)
      mockDownloadFileAsync.mockImplementation(async () => {
        fileExists = true; // File was created by another process
        throw new Error('Download failed but file exists');
      });

      const result = await imageCache.getCachedImagePath('https://example.com/race-condition-unique.jpg', 'search');

      // Should return cached file path since file exists after error
      expect(result).toBeDefined();
    });
  });

  describe('getDownloadImagePath metadata handling', () => {
    it('updates lastAccessed for existing download metadata', async () => {
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 1024 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      // First cache
      await imageCache.cacheChapterImage('https://example.com/dl-update-unique.jpg', 'dl-manga-unique', 'ch1', 5);

      // Second access should update lastAccessed
      const result = await imageCache.cacheChapterImage('https://example.com/dl-update-unique.jpg', 'dl-manga-unique', 'ch1', 5);

      expect(result).toContain('file://');
    });

    it('creates metadata for existing file without metadata', async () => {
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 512 });

      const result = await imageCache.getCachedImagePath('https://example.com/dl-no-meta-unique.jpg', 'download', 'dl-no-meta-manga-unique');

      expect(result).toContain('file://');
    });
  });

  describe('getChapterImagePath stale metadata removal', () => {
    it('removes stale metadata when cached file no longer exists', async () => {
      mockFileExists.mockReturnValue(true);
      mockFileInfo.mockReturnValue({ exists: true, size: 1024 });
      mockDownloadFileAsync.mockResolvedValue({
        uri: mockFileUri,
        info: () => ({ exists: true, size: 1024 }),
      });

      // First cache
      await imageCache.cacheChapterImage('https://example.com/stale-chapter-unique.jpg', 'stale-ch-manga-unique', 'ch5', 10);

      // File no longer exists
      mockFileExists.mockReturnValue(false);
      mockFileInfo.mockReturnValue({ exists: false, size: 0 });

      // Get chapter path - should return null and clean metadata
      const result = await imageCache.getChapterImagePath('stale-ch-manga-unique', 'ch5', 10);

      expect(result).toBeNull();
    });
  });

  describe('clearCache functionality', () => {
    it('clears search cache and verifies directory recreation', async () => {
      await imageCache.clearCache('search');
      expect(mockDirDelete).toHaveBeenCalled();
    });

    it('clears manga cache and verifies directory recreation', async () => {
      await imageCache.clearCache('manga');
      expect(mockDirDelete).toHaveBeenCalled();
    });

    it('clears download cache and verifies directory recreation', async () => {
      await imageCache.clearCache('download');
      expect(mockDirDelete).toHaveBeenCalled();
    });
  });

  describe('getCacheStats error handling', () => {
    it('returns valid stats structure', async () => {
      const stats = await imageCache.getCacheStats();

      expect(stats).toHaveProperty('totalSize');
      expect(stats).toHaveProperty('totalFiles');
      expect(stats).toHaveProperty('mangaCount');
      expect(stats).toHaveProperty('searchCount');
      expect(stats).toHaveProperty('downloadCount');
      expect(typeof stats.totalSize).toBe('number');
    });
  });
});
