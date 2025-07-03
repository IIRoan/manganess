import { useEffect, useState } from 'react';
import * as FileSystem from 'expo-file-system';
// Using a simple hash function instead of expo-crypto to avoid adding dependencies
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}
import AsyncStorage from '@react-native-async-storage/async-storage';

const BASE_CACHE_FOLDER = `${FileSystem.cacheDirectory}image_cache/`;
const MANGA_CACHE_FOLDER = `${BASE_CACHE_FOLDER}manga_covers/`;
const SEARCH_CACHE_FOLDER = `${BASE_CACHE_FOLDER}search_temp/`;
const CACHE_METADATA_KEY = 'image_cache_metadata';
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_CACHE_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const SEARCH_CACHE_AGE = 60 * 60 * 1000; // 1 hour for search temp cache
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_BASE = 1000; // 1 second base delay

export type CacheContext = 'manga' | 'search' | 'bookmark';

interface CacheMetadata {
  mangaId?: string;
  originalUrl: string;
  cachedPath: string;
  lastAccessed: number;
  lastUpdated: number;
  context: CacheContext;
  fileSize: number;
  urlHash: string;
}

interface CacheStats {
  totalSize: number;
  totalFiles: number;
  mangaCount: number;
  searchCount: number;
  oldestEntry: number;
  newestEntry: number;
}

class ImageCache {
  private static instance: ImageCache;
  private initialized: boolean = false;
  private metadata: Map<string, CacheMetadata> = new Map();
  private metadataLoaded: boolean = false;
  private downloadQueue: Map<string, Promise<string>> = new Map();

  private constructor() {}

  static getInstance(): ImageCache {
    if (!ImageCache.instance) {
      ImageCache.instance = new ImageCache();
    }
    return ImageCache.instance;
  }

  async initializeCache() {
    if (this.initialized) return;

    try {
      // Create cache directories
      await this.ensureDirectoryExists(BASE_CACHE_FOLDER);
      await this.ensureDirectoryExists(MANGA_CACHE_FOLDER);
      await this.ensureDirectoryExists(SEARCH_CACHE_FOLDER);

      // Load metadata
      await this.loadMetadata();

      // Clean up expired entries
      await this.cleanupExpiredEntries();

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize cache:', error);
    }
  }

  private async ensureDirectoryExists(path: string) {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(path, { intermediates: true });
    }
  }

  private async loadMetadata() {
    if (this.metadataLoaded) return;

    try {
      const stored = await AsyncStorage.getItem(CACHE_METADATA_KEY);
      if (stored) {
        const data = JSON.parse(stored) as Record<string, CacheMetadata>;
        this.metadata = new Map(Object.entries(data));
      }
      this.metadataLoaded = true;
    } catch (error) {
      console.error('Failed to load cache metadata:', error);
      this.metadata = new Map();
      this.metadataLoaded = true;
    }
  }

  private async saveMetadata() {
    try {
      const data = Object.fromEntries(this.metadata.entries());
      await AsyncStorage.setItem(CACHE_METADATA_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save cache metadata:', error);
    }
  }

  private generateCacheKey(url: string, mangaId?: string): string {
    const urlHash = simpleHash(url);
    const timestamp = Date.now();
    const prefix = mangaId ? `${mangaId}_` : 'temp_';
    return `${prefix}${urlHash.substring(0, 12)}_${timestamp}`;
  }

  private getCachePath(context: CacheContext, filename: string): string {
    const folder =
      context === 'search' ? SEARCH_CACHE_FOLDER : MANGA_CACHE_FOLDER;
    return `${folder}${filename}.jpg`;
  }

  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxAttempts: number = MAX_RETRY_ATTEMPTS
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxAttempts) {
          throw lastError;
        }

        // Exponential backoff with jitter
        const delay =
          RETRY_DELAY_BASE * Math.pow(2, attempt - 1) + Math.random() * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));

        console.log(
          `Retry attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`
        );
      }
    }

    throw lastError!;
  }

  private async downloadImageWithRetry(
    url: string,
    filePath: string
  ): Promise<boolean> {
    return this.retryWithBackoff(async () => {
      const downloadResult = await FileSystem.downloadAsync(url, filePath);
      if (downloadResult.status !== 200) {
        throw new Error(
          `Download failed with status: ${downloadResult.status}`
        );
      }
      return true;
    });
  }

  async getCachedImagePath(
    url: string,
    context: CacheContext = 'search',
    mangaId?: string
  ): Promise<string> {
    if (!url) return url;

    try {
      await this.initializeCache();

      // For search context, use temporary caching with shorter lifespan
      if (context === 'search') {
        return this.getSearchImagePath(url);
      }

      // For manga context, use persistent caching with validation
      return this.getMangaImagePath(url, mangaId || 'unknown');
    } catch (error) {
      console.error('Error getting cached image path:', error);
      return url;
    }
  }

  private async getSearchImagePath(url: string): Promise<string> {
    const urlHash = simpleHash(url);
    const filename = `search_${urlHash.substring(0, 16)}`;
    const filePath = this.getCachePath('search', filename);

    // Check if we're already downloading this image
    const existingDownload = this.downloadQueue.get(url);
    if (existingDownload) {
      return existingDownload;
    }

    const fileInfo = await FileSystem.getInfoAsync(filePath);

    // Check if file exists and is not too old
    if (fileInfo.exists) {
      const metadata = this.metadata.get(filename);
      if (metadata && Date.now() - metadata.lastUpdated < SEARCH_CACHE_AGE) {
        // Update last accessed time
        metadata.lastAccessed = Date.now();
        this.saveMetadata();
        return filePath;
      }
    }

    // Start download and add to queue
    const downloadPromise = this.downloadSearchImage(url, filePath, filename);
    this.downloadQueue.set(url, downloadPromise);

    try {
      const result = await downloadPromise;
      return result;
    } finally {
      this.downloadQueue.delete(url);
    }
  }

  private async downloadSearchImage(
    url: string,
    filePath: string,
    filename: string
  ): Promise<string> {
    try {
      await this.downloadImageWithRetry(url, filePath);

      // Store metadata for cleanup
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      this.metadata.set(filename, {
        originalUrl: url,
        cachedPath: filePath,
        lastAccessed: Date.now(),
        lastUpdated: Date.now(),
        context: 'search',
        fileSize: fileInfo.exists ? fileInfo.size : 0,
        urlHash: simpleHash(url),
      });
      await this.saveMetadata();
      return filePath;
    } catch (error) {
      console.error('Failed to download search image after retries:', error);
      return url; // Return original URL as fallback
    }
  }

  private async getMangaImagePath(
    url: string,
    mangaId: string
  ): Promise<string> {
    const cacheKey = this.generateCacheKey(url, mangaId);
    const filePath = this.getCachePath('manga', cacheKey);

    // Check if we have a cached version for this manga
    const existingEntry = Array.from(this.metadata.values()).find(
      (entry) =>
        entry.mangaId === mangaId &&
        entry.context === 'manga' &&
        entry.originalUrl === url
    );

    if (existingEntry) {
      const fileInfo = await FileSystem.getInfoAsync(existingEntry.cachedPath);
      if (fileInfo.exists) {
        // Update last accessed time
        existingEntry.lastAccessed = Date.now();
        await this.saveMetadata();
        return existingEntry.cachedPath;
      } else {
        // Remove stale metadata
        const entryKey = Array.from(this.metadata.entries()).find(
          ([_, entry]) => entry === existingEntry
        )?.[0];
        if (entryKey) {
          this.metadata.delete(entryKey);
        }
      }
    }

    // Download new image
    try {
      await this.downloadImageWithRetry(url, filePath);

      const fileInfo = await FileSystem.getInfoAsync(filePath);
      this.metadata.set(cacheKey, {
        mangaId,
        originalUrl: url,
        cachedPath: filePath,
        lastAccessed: Date.now(),
        lastUpdated: Date.now(),
        context: 'manga',
        fileSize: fileInfo.exists ? fileInfo.size : 0,
        urlHash: simpleHash(url),
      });
      await this.saveMetadata();

      // Clean up if cache is getting too large
      await this.manageCacheSize();

      return filePath;
    } catch (error) {
      console.error('Failed to download manga image after retries:', error);
    }

    return url;
  }

  async validateAndUpdateCache(
    mangaId: string,
    currentUrl: string
  ): Promise<string> {
    await this.initializeCache();

    // Find existing cache entry for this manga
    const existingEntry = Array.from(this.metadata.values()).find(
      (entry) => entry.mangaId === mangaId && entry.context === 'manga'
    );

    if (existingEntry) {
      // Check if URL has changed
      if (existingEntry.originalUrl !== currentUrl) {
        console.log(`Image URL changed for manga ${mangaId}, updating cache`);

        // Remove old cached file
        try {
          const fileInfo = await FileSystem.getInfoAsync(
            existingEntry.cachedPath
          );
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(existingEntry.cachedPath);
          }
        } catch (error) {
          console.error('Error removing old cached file:', error);
        }

        // Remove old metadata entry
        const entryKey = Array.from(this.metadata.entries()).find(
          ([_, entry]) => entry === existingEntry
        )?.[0];
        if (entryKey) {
          this.metadata.delete(entryKey);
        }

        // Cache new image
        return this.getMangaImagePath(currentUrl, mangaId);
      } else {
        // URL hasn't changed, return existing cached path
        const fileInfo = await FileSystem.getInfoAsync(
          existingEntry.cachedPath
        );
        if (fileInfo.exists) {
          existingEntry.lastAccessed = Date.now();
          await this.saveMetadata();
          return existingEntry.cachedPath;
        } else {
          // File doesn't exist, re-download
          return this.getMangaImagePath(currentUrl, mangaId);
        }
      }
    } else {
      // No existing entry, cache new image
      return this.getMangaImagePath(currentUrl, mangaId);
    }
  }

  async clearCache(context?: CacheContext): Promise<void> {
    try {
      await this.initializeCache();

      if (context === 'search') {
        // Clear only search cache
        await FileSystem.deleteAsync(SEARCH_CACHE_FOLDER);
        await this.ensureDirectoryExists(SEARCH_CACHE_FOLDER);

        // Remove search metadata
        for (const [key, entry] of this.metadata.entries()) {
          if (entry.context === 'search') {
            this.metadata.delete(key);
          }
        }
      } else if (context === 'manga') {
        // Clear only manga cache
        await FileSystem.deleteAsync(MANGA_CACHE_FOLDER);
        await this.ensureDirectoryExists(MANGA_CACHE_FOLDER);

        // Remove manga metadata
        for (const [key, entry] of this.metadata.entries()) {
          if (entry.context === 'manga') {
            this.metadata.delete(key);
          }
        }
      } else {
        // Clear all cache
        await FileSystem.deleteAsync(BASE_CACHE_FOLDER);
        await this.ensureDirectoryExists(BASE_CACHE_FOLDER);
        await this.ensureDirectoryExists(MANGA_CACHE_FOLDER);
        await this.ensureDirectoryExists(SEARCH_CACHE_FOLDER);

        this.metadata.clear();
      }

      await this.saveMetadata();
    } catch (error) {
      console.error('Error clearing cache:', error);
      // Ensure directories exist even if clearing failed
      await this.ensureDirectoryExists(BASE_CACHE_FOLDER);
      await this.ensureDirectoryExists(MANGA_CACHE_FOLDER);
      await this.ensureDirectoryExists(SEARCH_CACHE_FOLDER);
    }
  }

  async getCacheStats(): Promise<CacheStats> {
    try {
      await this.initializeCache();

      let totalSize = 0;
      let totalFiles = 0;
      let mangaCount = 0;
      let searchCount = 0;
      let oldestEntry = Date.now();
      let newestEntry = 0;

      for (const entry of this.metadata.values()) {
        const fileInfo = await FileSystem.getInfoAsync(entry.cachedPath);
        if (fileInfo.exists) {
          totalSize += entry.fileSize;
          totalFiles++;

          if (entry.context === 'manga') mangaCount++;
          if (entry.context === 'search') searchCount++;

          if (entry.lastUpdated < oldestEntry) oldestEntry = entry.lastUpdated;
          if (entry.lastUpdated > newestEntry) newestEntry = entry.lastUpdated;
        }
      }

      return {
        totalSize,
        totalFiles,
        mangaCount,
        searchCount,
        oldestEntry: totalFiles > 0 ? oldestEntry : 0,
        newestEntry: totalFiles > 0 ? newestEntry : 0,
      };
    } catch (error) {
      console.error('Error getting cache stats:', error);
      return {
        totalSize: 0,
        totalFiles: 0,
        mangaCount: 0,
        searchCount: 0,
        oldestEntry: 0,
        newestEntry: 0,
      };
    }
  }

  private async cleanupExpiredEntries(): Promise<void> {
    const now = Date.now();
    const expiredEntries: string[] = [];

    for (const [key, entry] of this.metadata.entries()) {
      const maxAge =
        entry.context === 'search' ? SEARCH_CACHE_AGE : MAX_CACHE_AGE;
      if (now - entry.lastAccessed > maxAge) {
        expiredEntries.push(key);

        // Remove file
        try {
          const fileInfo = await FileSystem.getInfoAsync(entry.cachedPath);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(entry.cachedPath);
          }
        } catch (error) {
          console.error('Error removing expired cache file:', error);
        }
      }
    }

    // Remove metadata for expired entries
    for (const key of expiredEntries) {
      this.metadata.delete(key);
    }

    if (expiredEntries.length > 0) {
      console.log(`Cleaned up ${expiredEntries.length} expired cache entries`);
      await this.saveMetadata();
    }
  }

  private async manageCacheSize(): Promise<void> {
    const stats = await this.getCacheStats();

    if (stats.totalSize > MAX_CACHE_SIZE) {
      console.log(
        `Cache size (${Math.round(stats.totalSize / 1024 / 1024)}MB) exceeds limit, cleaning up...`
      );

      // Get all entries sorted by last accessed (oldest first)
      const sortedEntries = Array.from(this.metadata.entries())
        .filter(([_, entry]) => entry.context === 'manga') // Only clean manga cache, keep search temp
        .sort(([_, a], [__, b]) => a.lastAccessed - b.lastAccessed);

      let cleanedSize = 0;
      const targetCleanup = stats.totalSize - MAX_CACHE_SIZE * 0.8; // Clean to 80% of max

      for (const [key, entry] of sortedEntries) {
        if (cleanedSize >= targetCleanup) break;

        try {
          const fileInfo = await FileSystem.getInfoAsync(entry.cachedPath);
          if (fileInfo.exists) {
            await FileSystem.deleteAsync(entry.cachedPath);
            cleanedSize += entry.fileSize;
          }
          this.metadata.delete(key);
        } catch (error) {
          console.error('Error cleaning up cache file:', error);
        }
      }

      console.log(
        `Cleaned up ${Math.round(cleanedSize / 1024 / 1024)}MB of cache data`
      );
      await this.saveMetadata();
    }
  }
}

export const imageCache = ImageCache.getInstance();

export function useImageCache(
  url: string,
  context: CacheContext = 'search',
  mangaId?: string
): string {
  const [cachedPath, setCachedPath] = useState<string>(url);

  useEffect(() => {
    let isMounted = true;

    const cacheImage = async () => {
      if (!url) return;

      try {
        const path = await imageCache.getCachedImagePath(url, context, mangaId);
        if (isMounted) {
          setCachedPath(path);
        }
      } catch (error) {
        console.error('Error in useImageCache:', error);
        if (isMounted) {
          setCachedPath(url);
        }
      }
    };

    cacheImage();

    return () => {
      isMounted = false;
    };
  }, [url, context, mangaId]);

  return cachedPath;
}

// Hook for manga-specific caching with validation
export function useMangaImageCache(mangaId: string, url: string): string {
  const [cachedPath, setCachedPath] = useState<string>(url);

  useEffect(() => {
    let isMounted = true;

    const validateAndCache = async () => {
      if (!url || !mangaId) return;

      try {
        const path = await imageCache.validateAndUpdateCache(mangaId, url);
        if (isMounted) {
          setCachedPath(path);
        }
      } catch (error) {
        console.error('Error in useMangaImageCache:', error);
        if (isMounted) {
          setCachedPath(url);
        }
      }
    };

    validateAndCache();

    return () => {
      isMounted = false;
    };
  }, [url, mangaId]);

  return cachedPath;
}
