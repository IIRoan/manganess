import { ChapterImage, ImageDownloadStatus } from '@/types/download';
import {
  Paths,
  Directory as FSDirectory,
  File as FSFile,
} from 'expo-file-system';
import axios from 'axios';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';
import { imageExtractorService } from './imageExtractor';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

interface TempCacheEntry {
  mangaId: string;
  chapterNumber: string;
  images: ChapterImage[];
  createdAt: number;
  accessedAt: number;
}

interface FetchOptions {
  chapterId?: string;
  vrfToken?: string;
}

class TemporaryImageCacheService {
  private static instance: TemporaryImageCacheService;
  private cache = new Map<string, TempCacheEntry>();
  private log = logger();
  private tempDir: FSDirectory | null = null;
  private downloadInProgress = new Map<string, Promise<ChapterImage[]>>();
  private retryTrackers = new Map<string, Map<number, number>>();
  private imageStatusListeners = new Map<
    string,
    Set<(image: ChapterImage, total: number) => void>
  >();
  private imageRetryLimit = 3;
  private pendingClears = new Set<string>();

  // Cache expiry: 1 hour
  private readonly CACHE_EXPIRY_MS = 60 * 60 * 1000;
  // Maximum cache entries in memory
  private readonly MAX_CACHE_ENTRIES = 3;

  private constructor() {
    this.initializeTempDir();
  }

  static getInstance(): TemporaryImageCacheService {
    if (!TemporaryImageCacheService.instance) {
      TemporaryImageCacheService.instance =
        new TemporaryImageCacheService();
    }
    return TemporaryImageCacheService.instance;
  }

  private async initializeTempDir() {
    try {
      this.tempDir = new FSDirectory(Paths.cache, 'temp_chapter_images');
      if (!this.tempDir.exists) {
        await this.tempDir.create();
      }
      if (isDebugEnabled()) {
        this.log.info('Storage', 'Temporary image cache initialized', {
          path: this.tempDir.uri,
        });
      }
    } catch (error) {
      this.log.error(
        'Storage',
        'Failed to initialize temp directory',
        { error: String(error) }
      );
    }
  }

  /**
   * Get or fetch images for a chapter, storing them temporarily
   * Supports progressive downloading with callback for partial results
   */
  async getOrFetchChapterImages(
    mangaId: string,
    chapterNumber: string,
    chapterUrl: string,
    progressCallback?: (images: ChapterImage[], total: number) => void,
    options?: FetchOptions,
    forceRefresh = false
  ): Promise<ChapterImage[]> {
    const cacheKey = `${mangaId}:${chapterNumber}`;
    const preserveExistingFiles = forceRefresh;

    if (forceRefresh) {
      const activeDownload = this.downloadInProgress.get(cacheKey);
      this.cache.delete(cacheKey);
      this.imageStatusListeners.delete(cacheKey);

      if (activeDownload) {
        try {
          await activeDownload;
        } catch (error) {
          this.log.debug('Service', 'Active download completed with error before refresh', {
            cacheKey,
            error: error instanceof Error ? error.message : String(error),
          });
        } finally {
          this.downloadInProgress.delete(cacheKey);
        }
      }
    } else {
      // Check if already in cache
      const cached = this.cache.get(cacheKey);
      if (cached && !this.isExpired(cached)) {
        cached.accessedAt = Date.now();
        if (isDebugEnabled()) {
          this.log.debug('Storage', 'Using cached temp images', {
            cacheKey,
            imageCount: cached.images.length,
          });
        }
        return cached.images;
      }

      // Check if already downloading
      if (this.downloadInProgress.has(cacheKey)) {
        if (isDebugEnabled()) {
          this.log.debug('Storage', 'Waiting for in-progress download', {
            cacheKey,
          });
        }
        return this.downloadInProgress.get(cacheKey)!;
      }
    }

    this.resetRetryTracker(cacheKey);

    const downloadPromise = this.downloadAndCacheImages(
      mangaId,
      chapterNumber,
      chapterUrl,
      progressCallback,
      options,
      preserveExistingFiles
    );

    this.downloadInProgress.set(cacheKey, downloadPromise);

    try {
      const images = await downloadPromise;
      return images;
    } finally {
      this.downloadInProgress.delete(cacheKey);
      this.imageStatusListeners.delete(cacheKey);
    }
  }

  /**
   * Download images and cache them temporarily with progressive updates
   */
  private async downloadAndCacheImages(
    mangaId: string,
    chapterNumber: string,
    chapterUrl: string,
    progressCallback?: (images: ChapterImage[], total: number) => void,
    options?: FetchOptions,
    preserveExistingFiles = false
  ): Promise<ChapterImage[]> {
    const cacheKey = `${mangaId}:${chapterNumber}`;

    try {
      this.log.info('Service', 'downloadAndCacheImages:start', {
        mangaId,
        chapterNumber,
        chapterUrl,
      });

      // Resolve chapter images using the same extractor used by download manager
      const extractedImages = await this.fetchChapterImages(
        chapterUrl,
        options
      );

      if (!extractedImages || extractedImages.length === 0) {
        throw new Error('No images found for chapter');
      }

      this.log.info('Service', 'Images extracted for temporary cache', {
        mangaId,
        chapterNumber,
        imageCount: extractedImages.length,
      });

      // Download images one by one with progressive updates
      const downloadedImages = await this.downloadImagesToTempProgressive(
        extractedImages,
        mangaId,
        chapterNumber,
        chapterUrl,
        progressCallback,
        extractedImages.length,
        preserveExistingFiles
      );

      // Store in cache
      const entry: TempCacheEntry = {
        mangaId,
        chapterNumber,
        images: downloadedImages,
        createdAt: Date.now(),
        accessedAt: Date.now(),
      };

      // Enforce cache limit
      if (this.cache.size >= this.MAX_CACHE_ENTRIES) {
        this.evictLeastRecentlyUsed();
      }

      this.cache.set(cacheKey, entry);
      this.imageStatusListeners.delete(cacheKey);

      this.log.info('Service', 'Temporary chapter cached', {
        cacheKey,
        imageCount: downloadedImages.length,
        cacheSize: this.cache.size,
      });

      return downloadedImages;
    } catch (error) {
      this.log.error('Service', 'Failed to download temporary images', {
        mangaId,
        chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      this.imageStatusListeners.delete(cacheKey);
      throw error;
    }
  }

  /**
   * Download images to temporary storage with progressive updates
   */
  private async downloadImagesToTempProgressive(
    images: ChapterImage[],
    mangaId: string,
    chapterNumber: string,
    chapterUrl: string,
    progressCallback?: (images: ChapterImage[], total: number) => void,
    totalImages: number = images.length,
    preserveExistingFiles = false
  ): Promise<ChapterImage[]> {
    const downloadedImages: ChapterImage[] = [];
    const chapterDir = await this.getTempChapterDirectory(
      mangaId,
      chapterNumber
    );
    const cacheKey = `${mangaId}:${chapterNumber}`;
    const expectedFileNames = new Set<string>();

    if (isDebugEnabled()) {
      this.log.info('Service', 'Downloading images to temp storage', {
        mangaId,
        chapterNumber,
        imageCount: images.length,
        tempDir: chapterDir.uri,
        preserveExistingFiles,
      });
    }

    await this.ensureTempDirectory(chapterDir, preserveExistingFiles);

    for (const image of images) {
      const fileName = `page_${image.pageNumber
        .toString()
        .padStart(4, '0')}.jpg`;
      const imageFile = new FSFile(chapterDir, fileName);
      expectedFileNames.add(fileName);

      try {
        if (!image.originalUrl) {
          this.log.warn('Service', 'Image missing URL', {
            pageNumber: image.pageNumber,
          });
          continue;
        }

        if (preserveExistingFiles && imageFile.exists) {
          const existingInfo = imageFile.info();
          const existingSize =
            existingInfo.exists && typeof existingInfo.size === 'number'
              ? existingInfo.size
              : 0;

          const existingImage: ChapterImage = {
            ...image,
            localPath: imageFile.uri,
            downloadStatus: ImageDownloadStatus.COMPLETED,
            fileSize: existingSize,
          };

          downloadedImages.push(existingImage);
          this.notifyImageStatus(cacheKey, existingImage, totalImages);

          if (progressCallback) {
            progressCallback([...downloadedImages], totalImages);
          }

          if (isDebugEnabled()) {
            this.log.debug('Service', 'Reusing cached temporary image', {
              pageNumber: image.pageNumber,
              fileSize: existingSize,
              progress: `${downloadedImages.length}/${totalImages}`,
            });
          }

          continue;
        }

        if (imageFile.exists && !preserveExistingFiles) {
          try {
            await imageFile.delete();
          } catch (deleteError) {
            this.log.warn('Service', 'Failed to delete existing temp image', {
              pageNumber: image.pageNumber,
              error:
                deleteError instanceof Error
                  ? deleteError.message
                  : String(deleteError),
            });
          }
        }

        // Download the image using expo-file-system
        const downloadedFile = await this.downloadWithRetry(
          image,
          imageFile,
          chapterUrl,
          cacheKey,
          totalImages
        );

        // Get file info
        const fileInfo = downloadedFile.info();
        const fileSize =
          fileInfo.exists && typeof fileInfo.size === 'number'
            ? fileInfo.size
            : 0;

        const downloadedImage: ChapterImage = {
          ...image,
          localPath: downloadedFile.uri,
          downloadStatus: ImageDownloadStatus.COMPLETED,
          fileSize,
        };

        downloadedImages.push(downloadedImage);
        this.notifyImageStatus(cacheKey, downloadedImage, totalImages);

        // Call progress callback with current progress
        if (progressCallback) {
          progressCallback([...downloadedImages], totalImages);
        }

        if (isDebugEnabled()) {
          this.log.debug('Service', 'Downloaded temporary image', {
            pageNumber: image.pageNumber,
            fileSize,
            progress: `${downloadedImages.length}/${totalImages}`,
          });
        }
      } catch (error) {
        this.log.warn('Service', 'Failed to download temporary image', {
          pageNumber: image.pageNumber,
          url: image.originalUrl,
          error: error instanceof Error ? error.message : String(error),
        });

        if (preserveExistingFiles && imageFile.exists) {
          const fallbackInfo = imageFile.info();
          const fallbackSize =
            fallbackInfo.exists && typeof fallbackInfo.size === 'number'
              ? fallbackInfo.size
              : 0;

          const fallbackImage: ChapterImage = {
            ...image,
            localPath: imageFile.uri,
            downloadStatus: ImageDownloadStatus.COMPLETED,
            fileSize: fallbackSize,
          };

          downloadedImages.push(fallbackImage);
          this.notifyImageStatus(cacheKey, fallbackImage, totalImages);
        } else {
          // Keep the image with original URL as fallback reference
          const failedImage: ChapterImage = {
            ...image,
            downloadStatus: ImageDownloadStatus.FAILED,
          };

          downloadedImages.push(failedImage);
          this.notifyImageStatus(cacheKey, failedImage, totalImages);
        }

        if (progressCallback) {
          progressCallback([...downloadedImages], totalImages);
        }
      }
    }

    if (isDebugEnabled()) {
      this.log.info('Service', 'Completed downloading temporary images', {
        mangaId,
        chapterNumber,
        successCount: downloadedImages.filter(
          (img) => img.downloadStatus === ImageDownloadStatus.COMPLETED
        ).length,
        totalCount: downloadedImages.length,
        preserveExistingFiles,
      });
    }

    if (preserveExistingFiles) {
      await this.cleanupChapterDirectory(chapterDir, expectedFileNames);
    }

    return downloadedImages;
  }

  addImageStatusListener(
    cacheKey: string,
    listener: (image: ChapterImage, total: number) => void
  ) {
    if (!this.imageStatusListeners.has(cacheKey)) {
      this.imageStatusListeners.set(cacheKey, new Set());
    }
    this.imageStatusListeners.get(cacheKey)!.add(listener);

    return () => {
      const listeners = this.imageStatusListeners.get(cacheKey);
      listeners?.delete(listener);
      if (listeners && listeners.size === 0) {
        this.imageStatusListeners.delete(cacheKey);
      }
    };
  }

  private async waitForActiveDownload(cacheKey: string) {
    if (this.pendingClears.has(cacheKey)) {
      return;
    }

    const inFlight = this.downloadInProgress.get(cacheKey);
    if (!inFlight) {
      return;
    }

    this.pendingClears.add(cacheKey);

    try {
      await inFlight;
    } catch (error) {
      this.log.debug('Service', 'Ongoing download completed with error before clearing cache', {
        cacheKey,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.pendingClears.delete(cacheKey);
    }
  }

  private notifyImageStatus(
    cacheKey: string,
    image: ChapterImage,
    total: number
  ) {
    const listeners = this.imageStatusListeners.get(cacheKey);
    if (!listeners || listeners.size === 0) {
      return;
    }

    listeners.forEach((listener) => {
      try {
        listener(image, total);
      } catch (error) {
        this.log.warn('Service', 'Image status listener failed', {
          cacheKey,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });
  }

  private async downloadWithRetry(
    image: ChapterImage,
    file: FSFile,
    chapterUrl: string,
    cacheKey: string,
    totalImages: number
  ) {
    const referer = this.getImageReferer(image.originalUrl, chapterUrl);
    let attempt = 0;
    let lastError: unknown = null;

    while (attempt < this.imageRetryLimit) {
      attempt++;
      this.incrementRetry(cacheKey, image.pageNumber);

      try {
        const downloaded = await FSFile.downloadFileAsync(
          image.originalUrl,
          file,
          {
            headers: {
              'User-Agent': USER_AGENT,
              Referer: referer,
              Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
            },
          }
        );

        this.notifyImageStatus(
          cacheKey,
          {
            ...image,
            downloadStatus: ImageDownloadStatus.DOWNLOADING,
          },
          totalImages
        );

        return downloaded;
      } catch (error) {
        lastError = error;

        this.notifyImageStatus(
          cacheKey,
          {
            ...image,
            downloadStatus: ImageDownloadStatus.PENDING,
          },
          totalImages
        );

        this.log.warn('Service', 'Temporary image download attempt failed', {
          pageNumber: image.pageNumber,
          attempt,
          maxAttempts: this.imageRetryLimit,
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt >= this.imageRetryLimit) {
          break;
        }

        await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
      }
    }

    throw lastError ?? new Error('Unknown download failure');
  }

  private resetRetryTracker(cacheKey: string) {
    this.retryTrackers.set(cacheKey, new Map());
  }

  private incrementRetry(cacheKey: string, pageNumber: number) {
    if (!this.retryTrackers.has(cacheKey)) {
      this.retryTrackers.set(cacheKey, new Map());
    }

    const tracker = this.retryTrackers.get(cacheKey)!;
    const retries = (tracker.get(pageNumber) ?? 0) + 1;
    tracker.set(pageNumber, retries);
  }

  getImageRetries(cacheKey: string, pageNumber: number): number {
    const tracker = this.retryTrackers.get(cacheKey);
    if (!tracker) {
      return 0;
    }
    return tracker.get(pageNumber) ?? 0;
  }

  private async fetchChapterImages(
    chapterUrl: string,
    options?: FetchOptions
  ): Promise<ChapterImage[]> {
    const errorMessages: string[] = [];

    if (options?.chapterId && options?.vrfToken) {
      try {
        const interceptedImages =
          await imageExtractorService.extractImagesFromInterceptedRequest(
            options.chapterId,
            options.vrfToken,
            chapterUrl
          );

        if (interceptedImages.length > 0) {
          return this.normalizeExtractedImages(interceptedImages);
        }

        errorMessages.push('Intercepted request returned no images');
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);
        errorMessages.push(`Intercepted request failed: ${message}`);
        this.log.warn('Service', 'Intercepted extraction failed', {
          chapterUrl,
          error: message,
        });
      }
    }

    try {
      const apiImages = await imageExtractorService.extractImagesFromApi(
        chapterUrl
      );

      if (apiImages.length > 0) {
        return this.normalizeExtractedImages(apiImages);
      }

      errorMessages.push('API extraction returned no images');
    } catch (apiError) {
      const message =
        apiError instanceof Error ? apiError.message : String(apiError);
      errorMessages.push(`API extraction failed: ${message}`);
      this.log.warn('Service', 'API extraction failed', {
        chapterUrl,
        error: message,
      });
    }

    try {
      const html = await this.fetchChapterHtml(chapterUrl);
      const htmlImages = await imageExtractorService.extractImagesFromHtml(
        html,
        chapterUrl
      );

      if (htmlImages && htmlImages.length > 0) {
        return this.normalizeExtractedImages(htmlImages);
      }

      errorMessages.push('HTML extraction returned no images');
    } catch (htmlError) {
      const message =
        htmlError instanceof Error ? htmlError.message : String(htmlError);
      errorMessages.push(`HTML extraction failed: ${message}`);
      this.log.error('Service', 'HTML extraction failed', {
        chapterUrl,
        error: message,
      });
    }

    const combinedMessage =
      errorMessages.length > 0
        ? errorMessages.join(' | ')
        : 'No images available after extraction attempts';

    throw new Error(combinedMessage);
  }

  private normalizeExtractedImages(images: ChapterImage[]): ChapterImage[] {
    const seen = new Set<number>();

    return images
      .filter((image) => {
        if (!image.originalUrl) {
          return false;
        }
        const pageKey = Number.isFinite(image.pageNumber)
          ? image.pageNumber
          : NaN;
        if (!Number.isFinite(pageKey)) {
          return false;
        }
        if (seen.has(pageKey)) {
          return false;
        }
        seen.add(pageKey);
        return true;
      })
      .map((image) => ({
        pageNumber: image.pageNumber,
        originalUrl: image.originalUrl,
        downloadStatus: ImageDownloadStatus.PENDING,
      }))
      .sort((a, b) => a.pageNumber - b.pageNumber);
  }

  private async fetchChapterHtml(chapterUrl: string): Promise<string> {
    const response = await axios.get(chapterUrl, {
      headers: {
        'User-Agent': USER_AGENT,
      },
      timeout: 30000,
    });

    const html = response.data;

    if (!html || typeof html !== 'string') {
      throw new Error('Invalid chapter HTML response');
    }

    return html;
  }

  private getImageReferer(imageUrl: string, chapterUrl: string): string {
    try {
      const url = new URL(imageUrl);
      return `${url.protocol}//${url.host}`;
    } catch {
      return chapterUrl;
    }
  }

  private async ensureTempDirectory(
    dir: FSDirectory,
    preserveExistingFiles = false
  ): Promise<void> {
    if (!dir.exists) {
      await this.createDirectorySafely(dir);
      return;
    }

    if (preserveExistingFiles) {
      return;
    }

    try {
      const entries = await dir.list();
      await Promise.allSettled(entries.map((entry) => entry.delete()));
    } catch (error) {
      this.log.warn('Service', 'Failed to clear temp directory entries', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (!dir.exists) {
      await this.createDirectorySafely(dir);
    }
  }

  private async cleanupChapterDirectory(
    dir: FSDirectory,
    expectedFileNames: Set<string>
  ) {
    try {
      const entries = await dir.list();
      await Promise.allSettled(
        entries.map(async (entry) => {
          const entryName = entry.name;
          const isDirectory = entry instanceof FSDirectory;
          const isTempFile = entryName.endsWith('.tmp');
          const shouldKeep = expectedFileNames.has(entryName);

          if (isDirectory) {
            return;
          }

          if (isTempFile || !shouldKeep) {
            try {
              await entry.delete();
            } catch (error) {
              this.log.warn('Service', 'Failed to remove stale temp image', {
                fileName: entryName,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        })
      );
    } catch (error) {
      this.log.warn('Service', 'Failed to cleanup chapter directory', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async createDirectorySafely(dir: FSDirectory): Promise<void> {
    try {
      if (dir.parentDirectory && !dir.parentDirectory.exists) {
        await this.createDirectorySafely(dir.parentDirectory);
      }
      if (!dir.exists) {
        await dir.create();
      }
    } catch (error) {
      this.log.warn('Service', 'Failed to create temp directory', {
        uri: dir.uri,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get or create temporary directory for a chapter
   */
  private async getTempChapterDirectory(
    mangaId: string,
    chapterNumber: string
  ): Promise<FSDirectory> {
    if (!this.tempDir) {
      await this.initializeTempDir();
      if (!this.tempDir) {
        throw new Error('Failed to initialize temp directory');
      }
    }

    const mangaDir = new FSDirectory(this.tempDir, mangaId);
    if (!mangaDir.exists) {
      await mangaDir.create();
    }

    const chapterDir = new FSDirectory(
      mangaDir,
      `chapter_${chapterNumber}`
    );
    if (!chapterDir.exists) {
      await chapterDir.create();
    }

    return chapterDir;
  }

  /**
   * Clear cache for a specific chapter
   */
  async clearChapterCache(mangaId: string, chapterNumber: string) {
    const cacheKey = `${mangaId}:${chapterNumber}`;
    this.cache.delete(cacheKey);

    await this.waitForActiveDownload(cacheKey);

    try {
      if (!this.tempDir) {
        await this.initializeTempDir();
        if (!this.tempDir) {
          return;
        }
      }

      const mangaDir = new FSDirectory(this.tempDir, mangaId);
      if (!mangaDir.exists) {
        return;
      }

      const chapterDir = new FSDirectory(
        mangaDir,
        `chapter_${chapterNumber}`
      );

      if (chapterDir.exists) {
        await chapterDir.delete();
      }

      if (isDebugEnabled()) {
        this.log.debug('Storage', 'Cleared temporary chapter cache', {
          cacheKey,
        });
      }
    } catch (error) {
      this.log.warn('Storage', 'Failed to delete temp chapter directory', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Clear all temporary caches
   */
  async clearAllCaches() {
    this.cache.clear();

    try {
      if (this.tempDir && this.tempDir.exists) {
        // Delete all subdirectories
        const entries = await this.tempDir.list();
        for (const entry of entries) {
          try {
            // Try to delete - will only work if it's a directory
            await entry.delete();
          } catch (error) {
            // Ignore errors for individual files
          }
        }
      }

      if (isDebugEnabled()) {
        this.log.info('Storage', 'Cleared all temporary image caches');
      }
    } catch (error) {
      this.log.warn('Storage', 'Failed to clear all temp caches', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: TempCacheEntry): boolean {
    return Date.now() - entry.createdAt > this.CACHE_EXPIRY_MS;
  }

  /**
   * Evict least recently used entry
   */
  private evictLeastRecentlyUsed() {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessedAt < lruTime) {
        lruTime = entry.accessedAt;
        lruKey = key;
      }
    }

    if (lruKey) {
      const entry = this.cache.get(lruKey);
      this.cache.delete(lruKey);

      if (entry) {
        this.clearChapterCache(entry.mangaId, entry.chapterNumber).catch(
          (error) => {
            this.log.warn(
              'Storage',
              'Failed to evict LRU cache entry',
              { error: String(error) }
            );
          }
        );
      }

      if (isDebugEnabled()) {
        this.log.debug('Storage', 'Evicted LRU cache entry', { lruKey });
      }
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += entry.images.reduce((sum, img) => sum + (img.fileSize || 0), 0);
    }

    return {
      cacheEntries: this.cache.size,
      totalSize,
      maxEntries: this.MAX_CACHE_ENTRIES,
      expiryMs: this.CACHE_EXPIRY_MS,
    };
  }
}

export const temporaryImageCacheService =
  TemporaryImageCacheService.getInstance();
