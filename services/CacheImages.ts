import { useEffect, useState } from 'react';
import {
  File as FSFile,
  Directory as FSDirectory,
  Paths,
} from 'expo-file-system';
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
import { isDebugEnabled } from '@/constants/env';

function normalizeUri(u: string): string {
  if (!u) return u;
  if (u.startsWith('http://') || u.startsWith('https://')) return u;
  if (u.startsWith('file://') || u.startsWith('content://')) return u;
  return `file://${u}`;
}

// New FileSystem API directories
const BASE_CACHE_DIR = new FSDirectory(Paths.cache, 'image_cache');
const MANGA_CACHE_DIR = new FSDirectory(BASE_CACHE_DIR, 'manga_covers');
const SEARCH_CACHE_DIR = new FSDirectory(BASE_CACHE_DIR, 'search_temp');
const DOWNLOAD_CACHE_DIR = new FSDirectory(BASE_CACHE_DIR, 'downloads');
const CACHE_METADATA_KEY = 'image_cache_metadata';
const MAX_CACHE_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_CACHE_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const SEARCH_CACHE_AGE = 60 * 60 * 1000; // 1 hour for search temp cache
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_BASE = 1000; // 1 second base delay

export type CacheContext = 'manga' | 'search' | 'bookmark' | 'download';

interface CacheMetadata {
  mangaId?: string;
  chapterNumber?: string | undefined;
  pageNumber?: number | undefined;
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
  downloadCount: number;
  oldestEntry: number;
  newestEntry: number;
}

class ImageCache {
  private static instance: ImageCache;
  private initialized: boolean = false;
  private metadata: Map<string, CacheMetadata> = new Map();
  private metadataLoaded: boolean = false;
  private downloadQueue: Map<string, Promise<string>> = new Map();

  // Throttled persistence and maintenance
  private saveTimer: any = null;
  private static readonly SAVE_DEBOUNCE_MS = 2000; // debounce metadata writes

  private manageTimer: any = null;
  private static readonly MANAGE_DEBOUNCE_MS = 15000; // throttle cache size management

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
      await this.ensureDirectoryExists(BASE_CACHE_DIR);
      await this.ensureDirectoryExists(MANGA_CACHE_DIR);
      await this.ensureDirectoryExists(SEARCH_CACHE_DIR);
      await this.ensureDirectoryExists(DOWNLOAD_CACHE_DIR);

      // Load metadata
      await this.loadMetadata();

      // Clean up expired entries
      await this.cleanupExpiredEntries();

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize cache:', error);
    }
  }

  private async ensureDirectoryExists(dir: FSDirectory) {
    try {
      if (!dir.exists) {
        await dir.create();
      }
    } catch (e) {
      // If create failed due to hierarchy, try creating parents explicitly
      await dir.create();
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

  private scheduleSaveMetadata() {
    if (this.saveTimer) return;
    const delay = ImageCache.SAVE_DEBOUNCE_MS;
    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        await this.saveMetadata();
      } catch {}
    }, delay);
  }

  private scheduleManageCacheSize() {
    if (this.manageTimer) return;
    const delay = ImageCache.MANAGE_DEBOUNCE_MS;
    this.manageTimer = setTimeout(async () => {
      this.manageTimer = null;
      try {
        await this.manageCacheSize();
      } catch (e) {
        console.error('Error in scheduled cache maintenance:', e);
      }
    }, delay);
  }

  private generateCacheKey(url: string, mangaId?: string): string {
    const urlHash = simpleHash(url);
    const timestamp = Date.now();
    const prefix = mangaId ? `${mangaId}_` : 'temp_';
    return `${prefix}${urlHash.substring(0, 12)}_${timestamp}`;
  }

  private getCacheFile(context: CacheContext, filename: string): FSFile {
    let dir: FSDirectory;
    switch (context) {
      case 'search':
        dir = SEARCH_CACHE_DIR;
        break;
      case 'download':
        dir = DOWNLOAD_CACHE_DIR;
        break;
      default:
        dir = MANGA_CACHE_DIR;
        break;
    }
    return new FSFile(dir, `${filename}.jpg`);
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

        if (isDebugEnabled())
          console.log(
            `Retry attempt ${attempt} failed, retrying in ${Math.round(delay)}ms...`
          );
      }
    }

    throw lastError!;
  }

  private async downloadImageWithRetry(
    url: string,
    destFile: FSFile
  ): Promise<FSFile> {
    return this.retryWithBackoff<FSFile>(async () => {
      // Ensure destination is clear before downloading
      if (destFile.exists) {
        try {
          destFile.delete();
        } catch (e) {
          // Ignore delete errors, might be locked or race condition
        }
      }
      const output = await FSFile.downloadFileAsync(url, destFile);
      return output as FSFile; // Promise rejects on non-2xx status per new API
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

      // For download context, use specialized download caching
      if (context === 'download') {
        return this.getDownloadImagePath(url, mangaId || 'unknown');
      }

      // For manga context, use persistent caching with validation
      return this.getMangaImagePath(url, mangaId || 'unknown');
    } catch (error) {
      console.error('Error getting cached image path:', error);
      return url;
    }
  }

  private async getSearchImagePath(url: string): Promise<string> {
    const queueKey = `search:${url}`;
    // Check if we're already downloading this image
    const existingDownload = this.downloadQueue.get(queueKey);
    if (existingDownload) {
      return existingDownload;
    }

    const urlHash = simpleHash(url);
    const filename = `search_${urlHash.substring(0, 16)}`;
    const file = new FSFile(SEARCH_CACHE_DIR, `${filename}.jpg`);

    const info = file.info();

    // If file exists, prefer using it to avoid collisions. Update or create metadata.
    if (info.exists) {
      const now = Date.now();
      const existingMeta = this.metadata.get(filename);
      const size = typeof info.size === 'number' ? info.size : 0;
      if (existingMeta) {
        existingMeta.lastAccessed = now;
        // If stale, mark it as refreshed logically to suppress re-downloads during searches
        if (now - existingMeta.lastUpdated >= SEARCH_CACHE_AGE) {
          existingMeta.lastUpdated = now;
        }
      } else {
        this.metadata.set(filename, {
          originalUrl: url,
          cachedPath: file.uri,
          lastAccessed: now,
          lastUpdated: now,
          context: 'search',
          fileSize: size,
          urlHash: simpleHash(url),
        });
      }
      this.scheduleSaveMetadata();
      return normalizeUri(file.uri);
    }

    // Start download and add to queue
    const downloadPromise = this.downloadSearchImage(url, file, filename);
    this.downloadQueue.set(queueKey, downloadPromise);

    try {
      const result = await downloadPromise;
      return result;
    } finally {
      this.downloadQueue.delete(queueKey);
    }
  }

  private async downloadSearchImage(
    url: string,
    file: FSFile,
    filename: string
  ): Promise<string> {
    try {
      // Ensure destination path is free to avoid "Destination already exists"
      const preInfo = file.info();
      if (preInfo.exists) {
        try {
          file.delete();
        } catch {}
      }

      const output = await this.downloadImageWithRetry(url, file);

      // Store metadata for cleanup
      const fileInfo = output.info();
      const sz =
        fileInfo.exists && typeof fileInfo.size === 'number'
          ? fileInfo.size
          : 0;
      this.metadata.set(filename, {
        originalUrl: url,
        cachedPath: output.uri,
        lastAccessed: Date.now(),
        lastUpdated: Date.now(),
        context: 'search',
        fileSize: sz,
        urlHash: simpleHash(url),
      });
      this.scheduleSaveMetadata();
      return normalizeUri(output.uri);
    } catch (error: any) {
      // If the file already exists, treat it as success and update metadata
      const info = file.info();
      if (info.exists) {
        const now = Date.now();
        const size = typeof info.size === 'number' ? info.size : 0;
        this.metadata.set(filename, {
          originalUrl: url,
          cachedPath: file.uri,
          lastAccessed: now,
          lastUpdated: now,
          context: 'search',
          fileSize: size,
          urlHash: simpleHash(url),
        });
        this.scheduleSaveMetadata();
        return normalizeUri(file.uri);
      }
      console.error('Failed to download search image after retries:', error);
      return url; // Return original URL as fallback
    }
  }

  private async getMangaImagePath(
    url: string,
    mangaId: string
  ): Promise<string> {
    const queueKey = `manga:${mangaId}:${url}`;
    const existingDownload = this.downloadQueue.get(queueKey);
    if (existingDownload) {
      return existingDownload;
    }

    // Check if we have a cached version for this manga
    const existingEntry = Array.from(this.metadata.values()).find(
      (entry) =>
        entry.mangaId === mangaId &&
        entry.context === 'manga' &&
        entry.originalUrl === url
    );

    if (existingEntry) {
      const existingFile = new FSFile(existingEntry.cachedPath);
      if (existingFile.exists) {
        // Update last accessed time
        existingEntry.lastAccessed = Date.now();
        this.scheduleSaveMetadata();
        return normalizeUri(existingFile.uri);
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

    const downloadPromise = (async () => {
      const cacheKey = this.generateCacheKey(url, mangaId);
      const file = this.getCacheFile('manga', cacheKey);

      // Download new image
      try {
        const output = await this.downloadImageWithRetry(url, file);

        const fileInfo = output.info();
        const sz =
          fileInfo.exists && typeof fileInfo.size === 'number'
            ? fileInfo.size
            : 0;
        this.metadata.set(cacheKey, {
          mangaId,
          originalUrl: url,
          cachedPath: output.uri,
          lastAccessed: Date.now(),
          lastUpdated: Date.now(),
          context: 'manga',
          fileSize: sz,
          urlHash: simpleHash(url),
        });
        this.scheduleSaveMetadata();

        // Clean up if cache is getting too large
        this.scheduleManageCacheSize();

        return normalizeUri(output.uri);
      } catch (error) {
        console.error('Failed to download manga image after retries:', error);
        return url;
      }
    })();

    this.downloadQueue.set(queueKey, downloadPromise);

    try {
      return await downloadPromise;
    } finally {
      this.downloadQueue.delete(queueKey);
    }
  }

  private async getDownloadImagePath(
    url: string,
    mangaId: string,
    chapterNumber?: string,
    pageNumber?: number
  ): Promise<string> {
    const queueKey = `download:${mangaId}:${chapterNumber || 'x'}:${pageNumber || 'x'}:${url}`;
    const existingDownload = this.downloadQueue.get(queueKey);
    if (existingDownload) {
      return existingDownload;
    }

    const urlHash = simpleHash(url);
    const filename =
      chapterNumber && pageNumber
        ? `${mangaId}_ch${chapterNumber}_p${pageNumber.toString().padStart(3, '0')}_${urlHash.substring(0, 8)}`
        : `${mangaId}_${urlHash.substring(0, 16)}`;

    const file = this.getCacheFile('download', filename);

    // Check if file already exists
    const info = file.info();
    if (info.exists) {
      // Update metadata if it exists
      const existingMeta = this.metadata.get(filename);
      if (existingMeta) {
        existingMeta.lastAccessed = Date.now();
      } else {
        // Create metadata for existing file
        const size = typeof info.size === 'number' ? info.size : 0;
        this.metadata.set(filename, {
          mangaId,
          chapterNumber: chapterNumber || undefined,
          pageNumber: pageNumber || undefined,
          originalUrl: url,
          cachedPath: file.uri,
          lastAccessed: Date.now(),
          lastUpdated: Date.now(),
          context: 'download',
          fileSize: size,
          urlHash: simpleHash(url),
        });
      }
      this.scheduleSaveMetadata();
      return normalizeUri(file.uri);
    }

    const downloadPromise = (async () => {
      // Download new image for downloads
      try {
        const output = await this.downloadImageWithRetry(url, file);

        const fileInfo = output.info();
        const sz =
          fileInfo.exists && typeof fileInfo.size === 'number'
            ? fileInfo.size
            : 0;

        this.metadata.set(filename, {
          mangaId,
          chapterNumber: chapterNumber || undefined,
          pageNumber: pageNumber || undefined,
          originalUrl: url,
          cachedPath: output.uri,
          lastAccessed: Date.now(),
          lastUpdated: Date.now(),
          context: 'download',
          fileSize: sz,
          urlHash: simpleHash(url),
        });
        this.scheduleSaveMetadata();

        return normalizeUri(output.uri);
      } catch (error) {
        console.error('Failed to download chapter image after retries:', error);
        return url;
      }
    })();

    this.downloadQueue.set(queueKey, downloadPromise);

    try {
      return await downloadPromise;
    } finally {
      this.downloadQueue.delete(queueKey);
    }
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
        if (isDebugEnabled())
          console.log(`Image URL changed for manga ${mangaId}, updating cache`);

        // Remove old cached file
        try {
          const file = new FSFile(existingEntry.cachedPath);
          if (file.exists) {
            file.delete();
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
        const existingFile = new FSFile(existingEntry.cachedPath);
        if (existingFile.exists) {
          existingEntry.lastAccessed = Date.now();
          this.scheduleSaveMetadata();
          return normalizeUri(existingFile.uri);
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

  async getCachedMangaImagePath(
    mangaId: string,
    currentUrl?: string
  ): Promise<string | null> {
    await this.initializeCache();

    const existingEntry = Array.from(this.metadata.values()).find(
      (entry) => entry.mangaId === mangaId && entry.context === 'manga'
    );

    if (!existingEntry) {
      return null;
    }

    const file = new FSFile(existingEntry.cachedPath);
    if (file.exists) {
      existingEntry.lastAccessed = Date.now();
      this.scheduleSaveMetadata();
      return normalizeUri(file.uri);
    }

    // Remove stale metadata when the file no longer exists
    const entryKey = Array.from(this.metadata.entries()).find(
      ([_, entry]) => entry === existingEntry
    )?.[0];
    if (entryKey) {
      this.metadata.delete(entryKey);
      this.scheduleSaveMetadata();
    }

    return currentUrl ?? existingEntry.originalUrl ?? null;
  }

  // Download-specific cache methods
  async cacheChapterImage(
    url: string,
    mangaId: string,
    chapterNumber: string,
    pageNumber: number
  ): Promise<string> {
    await this.initializeCache();
    return this.getDownloadImagePath(url, mangaId, chapterNumber, pageNumber);
  }

  async getChapterImagePath(
    mangaId: string,
    chapterNumber: string,
    pageNumber: number
  ): Promise<string | null> {
    await this.initializeCache();

    // Find cached image for this specific page
    const entry = Array.from(this.metadata.values()).find(
      (entry) =>
        entry.context === 'download' &&
        entry.mangaId === mangaId &&
        entry.chapterNumber === chapterNumber &&
        entry.pageNumber === pageNumber
    );

    if (entry) {
      const file = new FSFile(entry.cachedPath);
      if (file.exists) {
        entry.lastAccessed = Date.now();
        this.scheduleSaveMetadata();
        return normalizeUri(file.uri);
      } else {
        // Remove stale metadata
        const entryKey = Array.from(this.metadata.entries()).find(
          ([_, e]) => e === entry
        )?.[0];
        if (entryKey) {
          this.metadata.delete(entryKey);
        }
      }
    }

    return null;
  }

  async deleteChapterCache(
    mangaId: string,
    chapterNumber: string
  ): Promise<void> {
    await this.initializeCache();

    const entriesToDelete: string[] = [];

    for (const [key, entry] of this.metadata.entries()) {
      if (
        entry.context === 'download' &&
        entry.mangaId === mangaId &&
        entry.chapterNumber === chapterNumber
      ) {
        entriesToDelete.push(key);

        // Remove file
        try {
          const file = new FSFile(entry.cachedPath);
          if (file.exists) {
            file.delete();
          }
        } catch (error) {
          console.error('Error removing chapter cache file:', error);
        }
      }
    }

    // Remove metadata for deleted entries
    for (const key of entriesToDelete) {
      this.metadata.delete(key);
    }

    if (entriesToDelete.length > 0) {
      this.scheduleSaveMetadata();
    }
  }

  async deleteMangaDownloadCache(mangaId: string): Promise<void> {
    await this.initializeCache();

    const entriesToDelete: string[] = [];

    for (const [key, entry] of this.metadata.entries()) {
      if (entry.context === 'download' && entry.mangaId === mangaId) {
        entriesToDelete.push(key);

        // Remove file
        try {
          const file = new FSFile(entry.cachedPath);
          if (file.exists) {
            file.delete();
          }
        } catch (error) {
          console.error('Error removing manga download cache file:', error);
        }
      }
    }

    // Remove metadata for deleted entries
    for (const key of entriesToDelete) {
      this.metadata.delete(key);
    }

    if (entriesToDelete.length > 0) {
      this.scheduleSaveMetadata();
    }
  }

  async getDownloadCacheStats(mangaId?: string): Promise<{
    totalSize: number;
    totalFiles: number;
    chapterCount: number;
  }> {
    await this.initializeCache();

    let totalSize = 0;
    let totalFiles = 0;
    const chapters = new Set<string>();

    for (const entry of this.metadata.values()) {
      if (
        entry.context === 'download' &&
        (!mangaId || entry.mangaId === mangaId)
      ) {
        const file = new FSFile(entry.cachedPath);
        if (file.exists) {
          totalSize += entry.fileSize;
          totalFiles++;
          if (entry.chapterNumber) {
            chapters.add(`${entry.mangaId}_${entry.chapterNumber}`);
          }
        }
      }
    }

    return {
      totalSize,
      totalFiles,
      chapterCount: chapters.size,
    };
  }

  async clearCache(context?: CacheContext): Promise<void> {
    try {
      await this.initializeCache();

      if (context === 'search') {
        // Clear only search cache
        SEARCH_CACHE_DIR.delete();
        await this.ensureDirectoryExists(SEARCH_CACHE_DIR);

        // Remove search metadata
        for (const [key, entry] of this.metadata.entries()) {
          if (entry.context === 'search') {
            this.metadata.delete(key);
          }
        }
      } else if (context === 'manga') {
        // Clear only manga cache
        MANGA_CACHE_DIR.delete();
        await this.ensureDirectoryExists(MANGA_CACHE_DIR);

        // Remove manga metadata
        for (const [key, entry] of this.metadata.entries()) {
          if (entry.context === 'manga') {
            this.metadata.delete(key);
          }
        }
      } else if (context === 'download') {
        // Clear only download cache
        DOWNLOAD_CACHE_DIR.delete();
        await this.ensureDirectoryExists(DOWNLOAD_CACHE_DIR);

        // Remove download metadata
        for (const [key, entry] of this.metadata.entries()) {
          if (entry.context === 'download') {
            this.metadata.delete(key);
          }
        }
      } else {
        // Clear all cache
        BASE_CACHE_DIR.delete();
        await this.ensureDirectoryExists(BASE_CACHE_DIR);
        await this.ensureDirectoryExists(MANGA_CACHE_DIR);
        await this.ensureDirectoryExists(SEARCH_CACHE_DIR);
        await this.ensureDirectoryExists(DOWNLOAD_CACHE_DIR);

        this.metadata.clear();
      }

      await this.saveMetadata();
    } catch (error) {
      console.error('Error clearing cache:', error);
      // Ensure directories exist even if clearing failed
      await this.ensureDirectoryExists(BASE_CACHE_DIR);
      await this.ensureDirectoryExists(MANGA_CACHE_DIR);
      await this.ensureDirectoryExists(SEARCH_CACHE_DIR);
      await this.ensureDirectoryExists(DOWNLOAD_CACHE_DIR);
    }
  }

  async getCacheStats(): Promise<CacheStats> {
    try {
      await this.initializeCache();

      let totalSize = 0;
      let totalFiles = 0;
      let mangaCount = 0;
      let searchCount = 0;
      let downloadCount = 0;
      let oldestEntry = Date.now();
      let newestEntry = 0;

      for (const entry of this.metadata.values()) {
        const file = new FSFile(entry.cachedPath);
        const info = file.info();
        if (info.exists) {
          totalSize += entry.fileSize;
          totalFiles++;

          if (entry.context === 'manga') mangaCount++;
          if (entry.context === 'search') searchCount++;
          if (entry.context === 'download') downloadCount++;

          if (entry.lastUpdated < oldestEntry) oldestEntry = entry.lastUpdated;
          if (entry.lastUpdated > newestEntry) newestEntry = entry.lastUpdated;
        }
      }

      return {
        totalSize,
        totalFiles,
        mangaCount,
        searchCount,
        downloadCount,
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
        downloadCount: 0,
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
          const file = new FSFile(entry.cachedPath);
          if (file.exists) {
            file.delete();
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
      if (isDebugEnabled())
        console.log(
          `Cleaned up ${expiredEntries.length} expired cache entries`
        );
      this.scheduleSaveMetadata();
    }
  }

  private async manageCacheSize(): Promise<void> {
    const stats = await this.getCacheStats();

    if (stats.totalSize > MAX_CACHE_SIZE) {
      if (isDebugEnabled())
        console.log(
          `Cache size (${Math.round(stats.totalSize / 1024 / 1024)}MB) exceeds limit, cleaning up...`
        );

      // Get all entries sorted by last accessed (oldest first)
      // Only clean manga and search cache, downloads are managed separately
      const sortedEntries = Array.from(this.metadata.entries())
        .filter(
          ([_, entry]) =>
            entry.context === 'manga' || entry.context === 'search'
        )
        .sort(([_, a], [__, b]) => a.lastAccessed - b.lastAccessed);

      let cleanedSize = 0;
      const targetCleanup = stats.totalSize - MAX_CACHE_SIZE * 0.8; // Clean to 80% of max

      for (const [key, entry] of sortedEntries) {
        if (cleanedSize >= targetCleanup) break;

        try {
          const file = new FSFile(entry.cachedPath);
          if (file.exists) {
            file.delete();
            cleanedSize += entry.fileSize;
          }
          this.metadata.delete(key);
        } catch (error) {
          console.error('Error cleaning up cache file:', error);
        }
      }

      if (isDebugEnabled())
        console.log(
          `Cleaned up ${Math.round(cleanedSize / 1024 / 1024)}MB of cache data`
        );
      this.scheduleSaveMetadata();
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
interface MangaImageCacheOptions {
  enabled?: boolean;
}

export function useMangaImageCache(
  mangaId: string,
  url: string,
  options?: MangaImageCacheOptions
): string {
  const [cachedPath, setCachedPath] = useState<string>(url);
  const shouldValidate = options?.enabled ?? true;

  useEffect(() => {
    let isMounted = true;

    const validateAndCache = async () => {
      if (!url || !mangaId) {
        return;
      }

      try {
        if (!shouldValidate) {
          const path = await imageCache.getCachedMangaImagePath(mangaId, url);
          if (isMounted) {
            setCachedPath(path ?? url);
          }
          return;
        }

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
  }, [url, mangaId, shouldValidate]);

  return cachedPath;
}

// Hook for download-specific image caching
export function useDownloadImageCache(
  url: string,
  mangaId: string,
  chapterNumber: string,
  pageNumber: number
): string {
  const [cachedPath, setCachedPath] = useState<string>(url);

  useEffect(() => {
    let isMounted = true;

    const cacheDownloadImage = async () => {
      if (!url || !mangaId || !chapterNumber) return;

      try {
        // First check if already cached
        const existingPath = await imageCache.getChapterImagePath(
          mangaId,
          chapterNumber,
          pageNumber
        );

        if (existingPath && isMounted) {
          setCachedPath(existingPath);
          return;
        }

        // If not cached, cache it
        const path = await imageCache.cacheChapterImage(
          url,
          mangaId,
          chapterNumber,
          pageNumber
        );
        if (isMounted) {
          setCachedPath(path);
        }
      } catch (error) {
        console.error('Error in useDownloadImageCache:', error);
        if (isMounted) {
          setCachedPath(url);
        }
      }
    };

    cacheDownloadImage();

    return () => {
      isMounted = false;
    };
  }, [url, mangaId, chapterNumber, pageNumber]);

  return cachedPath;
}
