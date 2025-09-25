import { useEffect, useState } from 'react';
import {
  Directory,
  File as FsFile,
  Paths,
  type FileInfo,
} from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

const BASE_CACHE_DIRECTORY = new Directory(Paths.cache, 'image_cache');
const MANGA_CACHE_DIRECTORY = new Directory(
  BASE_CACHE_DIRECTORY,
  'manga_covers'
);
const SEARCH_CACHE_DIRECTORY = new Directory(
  BASE_CACHE_DIRECTORY,
  'search_temp'
);
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
      await this.ensureDirectoryExists(BASE_CACHE_DIRECTORY);
      await this.ensureDirectoryExists(MANGA_CACHE_DIRECTORY);
      await this.ensureDirectoryExists(SEARCH_CACHE_DIRECTORY);

      await this.loadMetadata();
      await this.cleanupExpiredEntries();

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize cache:', error);
    }
  }

  private async ensureDirectoryExists(directory: Directory) {
    try {
      directory.create({ intermediates: true, idempotent: true });
    } catch (error) {
      console.error(`Failed to create directory ${directory.uri}:`, error);
      throw error;
    }
  }

  private getDirectoryForContext(context: CacheContext): Directory {
    return context === 'search'
      ? SEARCH_CACHE_DIRECTORY
      : MANGA_CACHE_DIRECTORY;
  }

  private getCacheFile(context: CacheContext, filename: string): FsFile {
    const directory = this.getDirectoryForContext(context);
    return new FsFile(directory, `${filename}.jpg`);
  }

  private readFileInfo(file: FsFile): FileInfo {
    try {
      return file.info();
    } catch (error) {
      console.error(`Failed to read file info for ${file.uri}:`, error);
      return { exists: false };
    }
  }

  private deleteFileIfExists(file: FsFile) {
    const fileInfo = this.readFileInfo(file);
    if (fileInfo.exists) {
      try {
        file.delete();
      } catch (error) {
        console.error(`Failed to delete file ${file.uri}:`, error);
      }
    }
  }

  private deleteDirectoryIfExists(directory: Directory) {
    try {
      const info = directory.info();
      if (info.exists) {
        directory.delete();
      }
    } catch (error) {
      console.error(`Failed to delete directory ${directory.uri}:`, error);
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
    targetFile: FsFile
  ): Promise<FsFile> {
    return this.retryWithBackoff(async () => {
      await this.ensureDirectoryExists(targetFile.parentDirectory);
      this.deleteFileIfExists(targetFile);

      const downloadResult = await FsFile.downloadFileAsync(url, targetFile);
      const normalizedFile = new FsFile(downloadResult.uri);
      const fileInfo = this.readFileInfo(normalizedFile);

      if (!fileInfo.exists || (fileInfo.size ?? 0) === 0) {
        throw new Error('Download completed but file is missing or empty');
      }

      return normalizedFile;
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

      if (context === 'search') {
        return this.getSearchImagePath(url);
      }

      return this.getMangaImagePath(url, mangaId || 'unknown');
    } catch (error) {
      console.error('Error getting cached image path:', error);
      return url;
    }
  }

  private async getSearchImagePath(url: string): Promise<string> {
    const urlHash = simpleHash(url);
    const filename = `search_${urlHash.substring(0, 16)}`;
    const cacheFile = this.getCacheFile('search', filename);

    const existingDownload = this.downloadQueue.get(url);
    if (existingDownload) {
      return existingDownload;
    }

    const fileInfo = this.readFileInfo(cacheFile);

    if (fileInfo.exists) {
      const metadata = this.metadata.get(filename);
      if (metadata && Date.now() - metadata.lastUpdated < SEARCH_CACHE_AGE) {
        metadata.lastAccessed = Date.now();
        this.saveMetadata();
        return cacheFile.uri;
      }
    }

    const downloadPromise = this.downloadSearchImage(url, cacheFile, filename);
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
    file: FsFile,
    filename: string
  ): Promise<string> {
    try {
      const downloadedFile = await this.downloadImageWithRetry(url, file);
      const fileInfo = this.readFileInfo(downloadedFile);

      this.metadata.set(filename, {
        originalUrl: url,
        cachedPath: downloadedFile.uri,
        lastAccessed: Date.now(),
        lastUpdated: Date.now(),
        context: 'search',
        fileSize: fileInfo.size ?? 0,
        urlHash: simpleHash(url),
      });
      await this.saveMetadata();
      return downloadedFile.uri;
    } catch (error) {
      console.error('Failed to download search image after retries:', error);
      return url;
    }
  }

  private async getMangaImagePath(
    url: string,
    mangaId: string
  ): Promise<string> {
    const cacheKey = this.generateCacheKey(url, mangaId);
    const cacheFile = this.getCacheFile('manga', cacheKey);

    const existingEntry = Array.from(this.metadata.values()).find(
      (entry) =>
        entry.mangaId === mangaId &&
        entry.context === 'manga' &&
        entry.originalUrl === url
    );

    if (existingEntry) {
      const existingFile = new FsFile(existingEntry.cachedPath);
      const fileInfo = this.readFileInfo(existingFile);
      if (fileInfo.exists) {
        existingEntry.lastAccessed = Date.now();
        await this.saveMetadata();
        return existingEntry.cachedPath;
      } else {
        const entryKey = Array.from(this.metadata.entries()).find(
          ([_, entry]) => entry === existingEntry
        )?.[0];
        if (entryKey) {
          this.metadata.delete(entryKey);
        }
      }
    }

    try {
      const downloadedFile = await this.downloadImageWithRetry(url, cacheFile);
      const fileInfo = this.readFileInfo(downloadedFile);

      this.metadata.set(cacheKey, {
        mangaId,
        originalUrl: url,
        cachedPath: downloadedFile.uri,
        lastAccessed: Date.now(),
        lastUpdated: Date.now(),
        context: 'manga',
        fileSize: fileInfo.size ?? 0,
        urlHash: simpleHash(url),
      });
      await this.saveMetadata();

      await this.manageCacheSize();

      return downloadedFile.uri;
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

    const existingEntry = Array.from(this.metadata.values()).find(
      (entry) => entry.mangaId === mangaId && entry.context === 'manga'
    );

    if (existingEntry) {
      if (existingEntry.originalUrl !== currentUrl) {
        console.log(`Image URL changed for manga ${mangaId}, updating cache`);

        try {
          const existingFile = new FsFile(existingEntry.cachedPath);
          this.deleteFileIfExists(existingFile);
        } catch (error) {
          console.error('Error removing old cached file:', error);
        }

        const entryKey = Array.from(this.metadata.entries()).find(
          ([_, entry]) => entry === existingEntry
        )?.[0];
        if (entryKey) {
          this.metadata.delete(entryKey);
        }

        return this.getMangaImagePath(currentUrl, mangaId);
      } else {
        const existingFile = new FsFile(existingEntry.cachedPath);
        const fileInfo = this.readFileInfo(existingFile);
        if (fileInfo.exists) {
          existingEntry.lastAccessed = Date.now();
          await this.saveMetadata();
          return existingEntry.cachedPath;
        } else {
          return this.getMangaImagePath(currentUrl, mangaId);
        }
      }
    } else {
      return this.getMangaImagePath(currentUrl, mangaId);
    }
  }

  async clearCache(context?: CacheContext): Promise<void> {
    try {
      await this.initializeCache();

      if (context === 'search') {
        this.deleteDirectoryIfExists(SEARCH_CACHE_DIRECTORY);
        await this.ensureDirectoryExists(SEARCH_CACHE_DIRECTORY);

        for (const [key, entry] of this.metadata.entries()) {
          if (entry.context === 'search') {
            this.metadata.delete(key);
          }
        }
      } else if (context === 'manga') {
        this.deleteDirectoryIfExists(MANGA_CACHE_DIRECTORY);
        await this.ensureDirectoryExists(MANGA_CACHE_DIRECTORY);

        for (const [key, entry] of this.metadata.entries()) {
          if (entry.context === 'manga') {
            this.metadata.delete(key);
          }
        }
      } else {
        this.deleteDirectoryIfExists(BASE_CACHE_DIRECTORY);
        await this.ensureDirectoryExists(BASE_CACHE_DIRECTORY);
        await this.ensureDirectoryExists(MANGA_CACHE_DIRECTORY);
        await this.ensureDirectoryExists(SEARCH_CACHE_DIRECTORY);

        this.metadata.clear();
      }

      await this.saveMetadata();
    } catch (error) {
      console.error('Error clearing cache:', error);
      await this.ensureDirectoryExists(BASE_CACHE_DIRECTORY);
      await this.ensureDirectoryExists(MANGA_CACHE_DIRECTORY);
      await this.ensureDirectoryExists(SEARCH_CACHE_DIRECTORY);
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
        const fileInfo = this.readFileInfo(new FsFile(entry.cachedPath));
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

        try {
          const file = new FsFile(entry.cachedPath);
          this.deleteFileIfExists(file);
        } catch (error) {
          console.error('Error removing expired cache file:', error);
        }
      }
    }

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

      const sortedEntries = Array.from(this.metadata.entries())
        .filter(([_, entry]) => entry.context === 'manga')
        .sort(([_, a], [__, b]) => a.lastAccessed - b.lastAccessed);

      let cleanedSize = 0;
      const targetCleanup = stats.totalSize - MAX_CACHE_SIZE * 0.8;

      for (const [key, entry] of sortedEntries) {
        if (cleanedSize >= targetCleanup) break;

        try {
          const file = new FsFile(entry.cachedPath);
          const fileInfo = this.readFileInfo(file);
          if (fileInfo.exists) {
            this.deleteFileIfExists(file);
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
): { path: string; loading: boolean } {
  const [path, setPath] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(Boolean(url));

  useEffect(() => {
    let isMounted = true;

    const cacheImage = async () => {
      if (!url) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const p = await imageCache.getCachedImagePath(url, context, mangaId);
        if (isMounted) {
          setPath(p);
        }
      } catch (error) {
        if (isMounted) {
          setPath(url);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    setPath('');
    setLoading(Boolean(url));
    cacheImage();

    return () => {
      isMounted = false;
    };
  }, [url, context, mangaId]);

  return { path, loading };
}

export function useMangaImageCache(
  mangaId: string,
  url: string
): { path: string; loading: boolean } {
  const [path, setPath] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(Boolean(url && mangaId));

  useEffect(() => {
    let isMounted = true;

    const validateAndCache = async () => {
      if (!url || !mangaId) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const p = await imageCache.validateAndUpdateCache(mangaId, url);
        if (isMounted) {
          setPath(p);
        }
      } catch (error) {
        if (isMounted) {
          setPath(url);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    setPath('');
    setLoading(Boolean(url && mangaId));
    validateAndCache();

    return () => {
      isMounted = false;
    };
  }, [url, mangaId]);

  return { path, loading };
}
