import {
  File as FSFile,
  Directory as FSDirectory,
  Paths,
} from 'expo-file-system';
import { requireOptionalNativeModule } from 'expo-modules-core';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ChapterImage,
  StorageStats,
  ChapterMetadata,
  ImageDownloadStatus,
  DownloadSettings,
} from '@/types/download';
import { ChapterStorageService } from '@/types/downloadInterfaces';
import { isDebugEnabled } from '@/constants/env';
import { logger } from '@/utils/logger';
import { downloadEventEmitter } from '@/utils/downloadEventEmitter';

// Storage configuration
const BASE_DOWNLOAD_DIR = new FSDirectory(Paths.cache, 'downloads');
const METADATA_KEY = 'chapter_downloads_metadata';
const SETTINGS_KEY = 'download_settings';
const USAGE_STATS_KEY = 'download_usage_stats';
const DEFAULT_MAX_STORAGE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB default limit
const STORAGE_VERSION = '1.0';

// Storage management constants
const CLEANUP_THRESHOLD = 0.85; // Start cleanup at 85% of max storage
const CLEANUP_TARGET = 0.7; // Clean up to 70% of max storage
const MIN_FREE_SPACE = 100 * 1024 * 1024; // Minimum 100MB free space
// const USAGE_TRACKING_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours - Reserved for future use

interface StorageUsageStats {
  lastAccessTimes: { [mangaId: string]: { [chapterNumber: string]: number } };
  accessCounts: { [mangaId: string]: { [chapterNumber: string]: number } };
  lastCleanup: number;
  totalDownloadsEver: number;
  totalSizeDownloadedEver: number;
}

interface DownloadMetadata {
  [mangaId: string]: {
    [chapterNumber: string]: ChapterMetadata;
  };
}

class ChapterStorage implements ChapterStorageService {
  private static instance: ChapterStorage;
  private initialized: boolean = false;
  private metadata: DownloadMetadata = {};
  private metadataLoaded: boolean = false;
  private settings: DownloadSettings | null = null;
  private usageStats: StorageUsageStats | null = null;
  private log = logger();

  // Throttled metadata persistence
  private saveTimer: any = null;
  private usageStatsTimer: any = null;
  private static readonly SAVE_DEBOUNCE_MS = 2000;
  private static readonly USAGE_STATS_DEBOUNCE_MS = 5000;

  private constructor() {}

  static getInstance(): ChapterStorage {
    if (!ChapterStorage.instance) {
      ChapterStorage.instance = new ChapterStorage();
    }
    return ChapterStorage.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Set initialized flag immediately to prevent multiple calls
      this.initialized = true;

      // Create base download directory
      await this.ensureDirectoryExists(BASE_DOWNLOAD_DIR);

      // Load data asynchronously without blocking UI
      Promise.all([
        this.loadMetadata(),
        this.loadSettings(),
        this.loadUsageStats(),
      ])
        .then(() => {
          // Perform storage check in background
          this.performStorageCheck().catch((error) => {
            this.log.error('Storage', 'Storage check failed during init', {
              error: error instanceof Error ? error.message : String(error),
            });
          });
        })
        .catch((error) => {
          this.log.error('Storage', 'Failed to load storage data', {
            error: error instanceof Error ? error.message : String(error),
          });
        });

      if (isDebugEnabled()) {
        this.log.info('Storage', 'Chapter storage service initialized');
      }
    } catch (error) {
      this.initialized = false; // Reset on error
      this.log.error('Storage', 'Failed to initialize chapter storage', {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private async ensureDirectoryExists(dir: FSDirectory): Promise<void> {
    try {
      if (!dir.exists) {
        // Ensure parent directory exists first
        if (dir.parentDirectory && !dir.parentDirectory.exists) {
          await this.ensureDirectoryExists(dir.parentDirectory);
        }
        await dir.create();
      }
    } catch (error) {
      this.log.error('Storage', 'Error creating directory', {
        path: dir.uri,
        error: error instanceof Error ? error.message : String(error),
      });
      // Try creating with explicit parent creation
      try {
        if (dir.parentDirectory && !dir.parentDirectory.exists) {
          await dir.parentDirectory.create();
        }
        await dir.create();
      } catch (retryError) {
        this.log.error('Storage', 'Retry creating directory failed', {
          path: dir.uri,
          error:
            retryError instanceof Error
              ? retryError.message
              : String(retryError),
        });
        throw retryError;
      }
    }
  }

  private async getDeviceFreeSpace(): Promise<number> {
    try {
      const legacyModule = requireOptionalNativeModule<{
        getFreeDiskStorageAsync?: () => Promise<number>;
      }>('ExponentFileSystem');

      if (legacyModule?.getFreeDiskStorageAsync) {
        const freeSpace = await legacyModule.getFreeDiskStorageAsync();
        if (Number.isFinite(freeSpace) && freeSpace >= 0) {
          return freeSpace;
        }
      }
    } catch (error) {
      this.log.warn(
        'Storage',
        'Failed to get free disk storage from legacy API',
        {
          error: error instanceof Error ? error.message : String(error),
        }
      );
    }

    const fallback = Paths.availableDiskSpace;
    if (Number.isFinite(fallback) && fallback >= 0) {
      return fallback;
    }

    return -1;
  }

  private async loadMetadata(): Promise<void> {
    if (this.metadataLoaded) return;

    try {
      const stored = await AsyncStorage.getItem(METADATA_KEY);
      if (stored) {
        this.metadata = JSON.parse(stored) as DownloadMetadata;
      }
      this.metadataLoaded = true;
    } catch (error) {
      this.log.error('Storage', 'Failed to load download metadata', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.metadata = {};
      this.metadataLoaded = true;
    }
  }

  private async saveMetadata(): Promise<void> {
    try {
      await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(this.metadata));
    } catch (error) {
      this.log.error('Storage', 'Failed to save download metadata', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async loadSettings(): Promise<void> {
    // Return early if settings are already loaded
    if (this.settings) return;

    try {
      const stored = await AsyncStorage.getItem(SETTINGS_KEY);
      if (stored) {
        this.settings = JSON.parse(stored) as DownloadSettings;
      } else {
        // Initialize with default settings
        this.settings = {
          maxConcurrentDownloads: 3,
          maxStorageSize: DEFAULT_MAX_STORAGE_SIZE,
          autoDownloadBookmarked: false,
          downloadQuality: 'original',
          enableBackgroundDownloads: true,
          storageWarningThreshold: 85,
          autoCleanupEnabled: false,
          autoCleanupDays: 30,
        };
        await this.saveSettings();
      }
    } catch (error) {
      this.log.error('Storage', 'Failed to load download settings', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.settings = {
        maxConcurrentDownloads: 3,
        maxStorageSize: DEFAULT_MAX_STORAGE_SIZE,
        autoDownloadBookmarked: false,
        downloadQuality: 'original',
        enableBackgroundDownloads: true,
        storageWarningThreshold: 85,
        autoCleanupEnabled: false,
        autoCleanupDays: 30,
      };
    }
  }

  private async saveSettings(): Promise<void> {
    if (!this.settings) return;

    try {
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings));
    } catch (error) {
      this.log.error('Storage', 'Failed to save download settings', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async loadUsageStats(): Promise<void> {
    // Return early if usage stats are already loaded
    if (this.usageStats) return;

    try {
      const stored = await AsyncStorage.getItem(USAGE_STATS_KEY);
      if (stored) {
        this.usageStats = JSON.parse(stored) as StorageUsageStats;
      } else {
        // Initialize with default usage stats
        this.usageStats = {
          lastAccessTimes: {},
          accessCounts: {},
          lastCleanup: 0,
          totalDownloadsEver: 0,
          totalSizeDownloadedEver: 0,
        };
        await this.saveUsageStats();
      }
    } catch (error) {
      this.log.error('Storage', 'Failed to load usage stats', {
        error: error instanceof Error ? error.message : String(error),
      });
      this.usageStats = {
        lastAccessTimes: {},
        accessCounts: {},
        lastCleanup: 0,
        totalDownloadsEver: 0,
        totalSizeDownloadedEver: 0,
      };
    }
  }

  private async saveUsageStats(): Promise<void> {
    if (!this.usageStats) return;

    try {
      await AsyncStorage.setItem(
        USAGE_STATS_KEY,
        JSON.stringify(this.usageStats)
      );
    } catch (error) {
      this.log.error('Storage', 'Failed to save usage stats', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private scheduleSaveMetadata(): void {
    if (this.saveTimer) return;

    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        await this.saveMetadata();
      } catch (error) {
        this.log.error('Storage', 'Error in scheduled metadata save', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, ChapterStorage.SAVE_DEBOUNCE_MS);
  }

  private scheduleSaveUsageStats(): void {
    if (this.usageStatsTimer) return;

    this.usageStatsTimer = setTimeout(async () => {
      this.usageStatsTimer = null;
      try {
        await this.saveUsageStats();
      } catch (error) {
        this.log.error('Storage', 'Error in scheduled usage stats save', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, ChapterStorage.USAGE_STATS_DEBOUNCE_MS);
  }

  private async performStorageCheck(): Promise<void> {
    try {
      const stats = await this.getStorageStats();
      const maxSize = this.settings?.maxStorageSize || DEFAULT_MAX_STORAGE_SIZE;

      // Check if we need cleanup
      if (stats.totalSize > maxSize * CLEANUP_THRESHOLD) {
        if (isDebugEnabled()) {
          this.log.info(
            'Storage',
            'Storage threshold exceeded, initiating cleanup',
            {
              totalSizeMB: Math.round(stats.totalSize / 1024 / 1024),
              maxSizeMB: Math.round(maxSize / 1024 / 1024),
            }
          );
        }
        await this.performIntelligentCleanup();
      }

      // Check if we're critically low on space
      if (stats.availableSpace < MIN_FREE_SPACE) {
        if (isDebugEnabled()) {
          this.log.warn(
            'Storage',
            'Critical storage space low, performing aggressive cleanup',
            {
              availableSpace: stats.availableSpace,
            }
          );
        }
        await this.performAggressiveCleanup();
      }
    } catch (error) {
      this.log.error('Storage', 'Failed to perform storage check', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async performIntelligentCleanup(): Promise<void> {
    if (!this.usageStats || !this.settings) return;

    try {
      const maxSize = this.settings.maxStorageSize;
      const targetSize = maxSize * CLEANUP_TARGET;
      const currentStats = await this.getStorageStats();

      if (currentStats.totalSize <= targetSize) {
        return; // No cleanup needed
      }

      // Get all chapters with usage data for intelligent cleanup
      const chaptersWithUsage = this.getChaptersWithUsageData();

      // Sort by cleanup priority (least recently used, least accessed)
      chaptersWithUsage.sort((a, b) => {
        const aLastAccess =
          this.usageStats!.lastAccessTimes[a.mangaId]?.[a.chapterNumber] || 0;
        const bLastAccess =
          this.usageStats!.lastAccessTimes[b.mangaId]?.[b.chapterNumber] || 0;
        const aAccessCount =
          this.usageStats!.accessCounts[a.mangaId]?.[a.chapterNumber] || 0;
        const bAccessCount =
          this.usageStats!.accessCounts[b.mangaId]?.[b.chapterNumber] || 0;

        // Primary sort: last access time (older first)
        if (aLastAccess !== bLastAccess) {
          return aLastAccess - bLastAccess;
        }

        // Secondary sort: access count (less accessed first)
        if (aAccessCount !== bAccessCount) {
          return aAccessCount - bAccessCount;
        }

        // Tertiary sort: download date (older first)
        return a.metadata.downloadedAt - b.metadata.downloadedAt;
      });

      let currentSize = currentStats.totalSize;
      let deletedCount = 0;
      let freedSpace = 0;

      for (const chapter of chaptersWithUsage) {
        if (currentSize <= targetSize) break;

        try {
          const chapterSize = chapter.metadata.totalSize;
          await this.deleteChapter(chapter.mangaId, chapter.chapterNumber);
          currentSize -= chapterSize;
          freedSpace += chapterSize;
          deletedCount++;
        } catch (error) {
          this.log.error(
            'Storage',
            'Failed to delete chapter during intelligent cleanup',
            {
              mangaId: chapter.mangaId,
              chapter: chapter.chapterNumber,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }
      }

      // Update cleanup timestamp
      this.usageStats.lastCleanup = Date.now();
      this.scheduleSaveUsageStats();

      if (isDebugEnabled() && deletedCount > 0) {
        this.log.info('Storage', 'Intelligent cleanup completed', {
          deletedChapters: deletedCount,
          freedSpaceMB: Math.round(freedSpace / 1024 / 1024),
        });
      }
    } catch (error) {
      this.log.error('Storage', 'Failed to perform intelligent cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async performAggressiveCleanup(): Promise<void> {
    try {
      const currentStats = await this.getStorageStats();
      const requiredSpace = MIN_FREE_SPACE;

      if (currentStats.availableSpace >= requiredSpace) {
        return; // Sufficient space available
      }

      // Get all chapters sorted by download date (oldest first)
      const allChapters = this.getAllChaptersSortedByAge();

      let currentSize = currentStats.totalSize;
      let deletedCount = 0;
      let freedSpace = 0;
      const maxSize = this.settings?.maxStorageSize || DEFAULT_MAX_STORAGE_SIZE;

      for (const chapter of allChapters) {
        const availableSpace = maxSize - currentSize;
        if (availableSpace >= requiredSpace) break;

        try {
          const chapterSize = chapter.metadata.totalSize;
          await this.deleteChapter(chapter.mangaId, chapter.chapterNumber);
          currentSize -= chapterSize;
          freedSpace += chapterSize;
          deletedCount++;
        } catch (error) {
          this.log.error(
            'Storage',
            'Failed to delete chapter during aggressive cleanup',
            {
              mangaId: chapter.mangaId,
              chapter: chapter.chapterNumber,
              error: error instanceof Error ? error.message : String(error),
            }
          );
        }
      }

      if (isDebugEnabled() && deletedCount > 0) {
        this.log.info('Storage', 'Aggressive cleanup completed', {
          deletedChapters: deletedCount,
          freedSpaceMB: Math.round(freedSpace / 1024 / 1024),
        });
      }
    } catch (error) {
      this.log.error('Storage', 'Failed to perform aggressive cleanup', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private getChaptersWithUsageData(): Array<{
    mangaId: string;
    chapterNumber: string;
    metadata: ChapterMetadata;
  }> {
    const chapters: Array<{
      mangaId: string;
      chapterNumber: string;
      metadata: ChapterMetadata;
    }> = [];

    for (const [mangaId, mangaChapters] of Object.entries(this.metadata)) {
      for (const [chapterNumber, metadata] of Object.entries(mangaChapters)) {
        chapters.push({ mangaId, chapterNumber, metadata });
      }
    }

    return chapters;
  }

  private getAllChaptersSortedByAge(): Array<{
    mangaId: string;
    chapterNumber: string;
    metadata: ChapterMetadata;
  }> {
    const chapters = this.getChaptersWithUsageData();

    // Sort by download date (oldest first)
    chapters.sort((a, b) => a.metadata.downloadedAt - b.metadata.downloadedAt);

    return chapters;
  }

  private trackChapterAccess(mangaId: string, chapterNumber: string): void {
    if (!this.usageStats) return;

    const now = Date.now();

    // Initialize manga entry if it doesn't exist
    if (!this.usageStats.lastAccessTimes[mangaId]) {
      this.usageStats.lastAccessTimes[mangaId] = {};
      this.usageStats.accessCounts[mangaId] = {};
    }

    // Update last access time
    this.usageStats.lastAccessTimes[mangaId]![chapterNumber] = now;

    // Increment access count
    const currentCount =
      this.usageStats.accessCounts[mangaId]![chapterNumber] || 0;
    this.usageStats.accessCounts[mangaId]![chapterNumber] = currentCount + 1;

    // Schedule save
    this.scheduleSaveUsageStats();
  }

  private getMangaDirectory(mangaId: string): FSDirectory {
    return new FSDirectory(BASE_DOWNLOAD_DIR, `manga_${mangaId}`);
  }

  private getChapterDirectory(
    mangaId: string,
    chapterNumber: string
  ): FSDirectory {
    const mangaDir = this.getMangaDirectory(mangaId);
    return new FSDirectory(mangaDir, `chapter_${chapterNumber}`);
  }

  private getChapterMetadataFile(
    mangaId: string,
    chapterNumber: string
  ): FSFile {
    const chapterDir = this.getChapterDirectory(mangaId, chapterNumber);
    return new FSFile(chapterDir, 'metadata.json');
  }

  private generateImageFilename(pageNumber: number): string {
    return `page_${pageNumber.toString().padStart(3, '0')}.jpg`;
  }

  async saveChapterImages(
    mangaId: string,
    chapterNumber: string,
    images: ChapterImage[]
  ): Promise<void> {
    await this.initialize();

    try {
      const chapterDir = this.getChapterDirectory(mangaId, chapterNumber);
      await this.ensureDirectoryExists(chapterDir);

      let totalSize = 0;
      const savedImages: ChapterImage[] = [];

      // Download and save each image
      for (const image of images) {
        try {
          const filename = this.generateImageFilename(image.pageNumber);
          const imageFile = new FSFile(chapterDir, filename);

          // Check if file already exists
          if (imageFile.exists) {
            if (isDebugEnabled()) {
              this.log.info('Storage', 'Using existing image file', {
                mangaId,
                chapterNumber,
                pageNumber: image.pageNumber,
              });
            }

            // Use existing file
            const fileInfo = imageFile.info();
            const fileSize =
              fileInfo.exists && typeof fileInfo.size === 'number'
                ? fileInfo.size
                : 0;

            totalSize += fileSize;

            const savedImage: ChapterImage = {
              ...image,
              localPath: imageFile.uri,
              fileSize,
            };

            savedImages.push(savedImage);
            continue;
          }

          // Download image to local storage
          const downloadedFile = await FSFile.downloadFileAsync(
            image.originalUrl,
            imageFile
          );

          // Get file size
          const fileInfo = downloadedFile.info();
          const fileSize =
            fileInfo.exists && typeof fileInfo.size === 'number'
              ? fileInfo.size
              : 0;

          totalSize += fileSize;

          // Update image with local path
          const savedImage: ChapterImage = {
            ...image,
            localPath: downloadedFile.uri,
            fileSize,
          };

          savedImages.push(savedImage);

          if (isDebugEnabled()) {
            this.log.info('Storage', 'Saved image for chapter', {
              mangaId,
              chapterNumber,
              pageNumber: image.pageNumber,
            });
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          // Check if it's a "destination already exists" error
          if (errorMessage.includes('already exists')) {
            // Try to use the existing file
            try {
              const filename = this.generateImageFilename(image.pageNumber);
              const imageFile = new FSFile(chapterDir, filename);

              if (imageFile.exists) {
                const fileInfo = imageFile.info();
                const fileSize =
                  fileInfo.exists && typeof fileInfo.size === 'number'
                    ? fileInfo.size
                    : 0;

                totalSize += fileSize;

                const savedImage: ChapterImage = {
                  ...image,
                  localPath: imageFile.uri,
                  fileSize,
                };

                savedImages.push(savedImage);

                if (isDebugEnabled()) {
                  this.log.info('Storage', 'Using existing image for chapter', {
                    mangaId,
                    chapterNumber,
                    pageNumber: image.pageNumber,
                  });
                }
                continue;
              }
            } catch (retryError) {
              this.log.error('Storage', 'Failed to reuse existing image file', {
                mangaId,
                chapterNumber,
                pageNumber: image.pageNumber,
                error:
                  retryError instanceof Error
                    ? retryError.message
                    : String(retryError),
              });
            }
          }

          this.log.error('Storage', 'Failed to save image', {
            mangaId,
            chapterNumber,
            pageNumber: image.pageNumber,
            error: error instanceof Error ? error.message : String(error),
          });
          // Continue with other images even if one fails
        }
      }

      // If no images were saved (all existed), still consider it successful
      if (savedImages.length === 0 && images.length > 0) {
        // All images already existed, let's verify they're all there
        for (const image of images) {
          const filename = this.generateImageFilename(image.pageNumber);
          const imageFile = new FSFile(chapterDir, filename);

          if (imageFile.exists) {
            const fileInfo = imageFile.info();
            const fileSize =
              fileInfo.exists && typeof fileInfo.size === 'number'
                ? fileInfo.size
                : 0;

            totalSize += fileSize;

            const savedImage: ChapterImage = {
              ...image,
              localPath: imageFile.uri,
              fileSize,
            };

            savedImages.push(savedImage);
          }
        }
      }

      // Save chapter metadata
      const chapterMetadata: ChapterMetadata = {
        mangaId,
        chapterNumber,
        downloadedAt: Date.now(),
        totalImages: savedImages.length,
        totalSize,
        version: STORAGE_VERSION,
      };

      const metadataFile = this.getChapterMetadataFile(mangaId, chapterNumber);

      try {
        await metadataFile.write(JSON.stringify(chapterMetadata, null, 2));

        if (isDebugEnabled()) {
          this.log.info('Storage', 'Saved chapter metadata', {
            mangaId,
            chapterNumber,
            imageCount: savedImages.length,
          });
        }
      } catch (metadataError) {
        this.log.error('Storage', 'Failed to save chapter metadata', {
          mangaId,
          chapterNumber,
          error:
            metadataError instanceof Error
              ? metadataError.message
              : String(metadataError),
        });
        // Continue anyway - the images are saved even if metadata fails
      }

      // Update in-memory metadata
      if (!this.metadata[mangaId]) {
        this.metadata[mangaId] = {};
      }
      this.metadata[mangaId][chapterNumber] = chapterMetadata;

      // Update usage statistics
      if (this.usageStats) {
        this.usageStats.totalDownloadsEver++;
        this.usageStats.totalSizeDownloadedEver += totalSize;
      }

      this.scheduleSaveMetadata();
      this.scheduleSaveUsageStats();

      // Check if we need cleanup after this download
      await this.performStorageCheck();

      if (isDebugEnabled()) {
        this.log.info('Storage', 'Saved chapter images', {
          mangaId,
          chapterNumber,
          imageCount: savedImages.length,
          totalSizeKB: Math.round(totalSize / 1024),
        });
      }
    } catch (error) {
      this.log.error('Storage', 'Failed to save chapter images', {
        mangaId,
        chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getChapterImages(
    mangaId: string,
    chapterNumber: string
  ): Promise<ChapterImage[] | null> {
    await this.initialize();

    try {
      const chapterDir = this.getChapterDirectory(mangaId, chapterNumber);

      if (!chapterDir.exists) {
        return null;
      }

      // Load chapter metadata
      const metadataFile = this.getChapterMetadataFile(mangaId, chapterNumber);
      if (!metadataFile.exists) {
        return null;
      }

      // Metadata file exists, so chapter is downloaded

      // Load images from directory
      const images: ChapterImage[] = [];

      // Read directory contents to find image files
      const dirContents = chapterDir.list();
      const imageFiles = dirContents
        .filter(
          (item) => item.name.startsWith('page_') && item.name.endsWith('.jpg')
        )
        .sort((a, b) => a.name.localeCompare(b.name));

      for (const fileItem of imageFiles) {
        const file = new FSFile(chapterDir, fileItem.name);
        const fileInfo = file.info();

        if (fileInfo.exists) {
          // Extract page number from filename
          const pageMatch = fileItem.name.match(/page_(\d+)\.jpg/);
          const pageNumber =
            pageMatch && pageMatch[1] ? parseInt(pageMatch[1], 10) : 0;

          const image: ChapterImage = {
            pageNumber,
            originalUrl: '', // We don't store original URL in local files
            localPath: file.uri,
            downloadStatus: ImageDownloadStatus.COMPLETED,
            fileSize: typeof fileInfo.size === 'number' ? fileInfo.size : 0,
          };

          images.push(image);
        }
      }

      // Sort by page number
      images.sort((a, b) => a.pageNumber - b.pageNumber);

      // Track chapter access for usage statistics
      if (images.length > 0) {
        this.trackChapterAccess(mangaId, chapterNumber);
      }

      return images.length > 0 ? images : null;
    } catch (error) {
      this.log.error('Storage', 'Failed to get chapter images', {
        mangaId,
        chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async deleteChapter(mangaId: string, chapterNumber: string): Promise<void> {
    await this.initialize();

    try {
      const chapterDir = this.getChapterDirectory(mangaId, chapterNumber);

      if (chapterDir.exists) {
        // Delete the entire chapter directory
        chapterDir.delete();

        if (isDebugEnabled()) {
          this.log.info('Storage', 'Deleted chapter directory', {
            mangaId,
            chapterNumber,
            path: chapterDir.uri,
          });
        }
      }

      // Remove from metadata
      if (this.metadata[mangaId] && this.metadata[mangaId][chapterNumber]) {
        delete this.metadata[mangaId][chapterNumber];

        // Remove from usage stats
        if (this.usageStats) {
          if (this.usageStats.lastAccessTimes[mangaId]) {
            delete this.usageStats.lastAccessTimes[mangaId][chapterNumber];
          }
          if (this.usageStats.accessCounts[mangaId]) {
            delete this.usageStats.accessCounts[mangaId][chapterNumber];
          }
        }

        // If no more chapters for this manga, remove manga entry
        if (Object.keys(this.metadata[mangaId]).length === 0) {
          delete this.metadata[mangaId];

          // Clean up usage stats for this manga
          if (this.usageStats) {
            delete this.usageStats.lastAccessTimes[mangaId];
            delete this.usageStats.accessCounts[mangaId];
          }

          // Also try to remove empty manga directory
          const mangaDir = this.getMangaDirectory(mangaId);
          if (mangaDir.exists) {
            try {
              mangaDir.delete();
            } catch (error) {
              // Ignore errors when deleting manga directory
              this.log.warn('Storage', 'Could not delete manga directory', {
                mangaId,
                error: error instanceof Error ? error.message : String(error),
              });
            }
          }
        }

        this.scheduleSaveMetadata();
        this.scheduleSaveUsageStats();
      }

      // Emit download deleted event
      downloadEventEmitter.emitDeleted(
        mangaId,
        chapterNumber,
        `${mangaId}_${chapterNumber}`
      );

      if (isDebugEnabled()) {
        this.log.info('Storage', 'Deleted chapter', {
          mangaId,
          chapterNumber,
        });
      }
    } catch (error) {
      this.log.error('Storage', 'Failed to delete chapter', {
        mangaId,
        chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  async getStorageStats(): Promise<StorageStats> {
    await this.initialize();

    try {
      let totalSize = 0;
      let totalChapters = 0;
      let mangaCount = 0;
      let oldestDownload = Date.now();

      for (const [_mangaId, chapters] of Object.entries(this.metadata)) {
        mangaCount++;

        for (const [_chapterNumber, metadata] of Object.entries(chapters)) {
          totalChapters++;
          totalSize += metadata.totalSize;

          if (metadata.downloadedAt < oldestDownload) {
            oldestDownload = metadata.downloadedAt;
          }
        }
      }

      // Calculate available space based on storage limit and device capacity
      const maxSize = this.settings?.maxStorageSize || DEFAULT_MAX_STORAGE_SIZE;
      const limitRemaining = Math.max(0, maxSize - totalSize);

      let deviceFreeSpace = await this.getDeviceFreeSpace();
      if (!Number.isFinite(deviceFreeSpace) || deviceFreeSpace < 0) {
        deviceFreeSpace = limitRemaining;
      }

      const availableSpace = Math.min(limitRemaining, deviceFreeSpace);

      return {
        totalSize,
        totalChapters,
        mangaCount,
        availableSpace,
        deviceFreeSpace,
        oldestDownload: totalChapters > 0 ? oldestDownload : 0,
      };
    } catch (error) {
      console.error('Failed to get storage stats:', error);
      const maxSize = this.settings?.maxStorageSize || DEFAULT_MAX_STORAGE_SIZE;
      let fallbackDeviceFree = await this.getDeviceFreeSpace();
      if (!Number.isFinite(fallbackDeviceFree) || fallbackDeviceFree < 0) {
        fallbackDeviceFree = maxSize;
      }
      const availableSpace = Math.min(maxSize, fallbackDeviceFree);
      return {
        totalSize: 0,
        totalChapters: 0,
        mangaCount: 0,
        availableSpace,
        deviceFreeSpace: fallbackDeviceFree,
        oldestDownload: 0,
      };
    }
  }

  async cleanupOldDownloads(): Promise<void> {
    await this.initialize();

    try {
      // Use intelligent cleanup by default
      await this.performIntelligentCleanup();
    } catch (error) {
      console.error('Failed to cleanup old downloads:', error);
    }
  }

  // Additional utility methods

  async isChapterDownloaded(
    mangaId: string,
    chapterNumber: string
  ): Promise<boolean> {
    await this.initialize();

    return !!(this.metadata[mangaId] && this.metadata[mangaId][chapterNumber]);
  }

  async getDownloadedChapters(mangaId: string): Promise<string[]> {
    await this.initialize();

    if (!this.metadata[mangaId]) {
      return [];
    }

    return Object.keys(this.metadata[mangaId]).sort();
  }

  async getMangaDownloadSize(mangaId: string): Promise<number> {
    await this.initialize();

    if (!this.metadata[mangaId]) {
      return 0;
    }

    let totalSize = 0;
    for (const metadata of Object.values(this.metadata[mangaId])) {
      totalSize += metadata.totalSize;
    }

    return totalSize;
  }

  async getDownloadedChaptersCount(mangaId: string): Promise<number> {
    await this.initialize();

    if (!this.metadata[mangaId]) {
      return 0;
    }

    return Object.keys(this.metadata[mangaId]).length;
  }

  async getMangaStorageSize(mangaId: string): Promise<number> {
    return this.getMangaDownloadSize(mangaId);
  }

  async clearAllDownloads(): Promise<void> {
    await this.initialize();

    try {
      // Delete the entire downloads directory
      if (BASE_DOWNLOAD_DIR.exists) {
        BASE_DOWNLOAD_DIR.delete();
      }

      // Recreate the base directory
      await this.ensureDirectoryExists(BASE_DOWNLOAD_DIR);

      // Clear metadata and usage stats
      this.metadata = {};
      if (this.usageStats) {
        this.usageStats.lastAccessTimes = {};
        this.usageStats.accessCounts = {};
        this.usageStats.lastCleanup = Date.now();
      }

      await Promise.all([this.saveMetadata(), this.saveUsageStats()]);

      if (isDebugEnabled()) {
        console.log('All downloads cleared');
      }
    } catch (error) {
      console.error('Failed to clear all downloads:', error);
      throw error;
    }
  }

  // Storage management methods

  async getDownloadSettings(): Promise<DownloadSettings> {
    // Only initialize if not already initialized
    if (!this.initialized) {
      await this.initialize();
    }

    // Ensure settings are loaded
    if (!this.settings) {
      await this.loadSettings();
    }

    return (
      this.settings || {
        maxConcurrentDownloads: 3,
        maxStorageSize: DEFAULT_MAX_STORAGE_SIZE,
        autoDownloadBookmarked: false,
        downloadQuality: 'original',
        enableBackgroundDownloads: true,
        storageWarningThreshold: 85,
        autoCleanupEnabled: false,
        autoCleanupDays: 30,
      }
    );
  }

  async updateDownloadSettings(
    newSettings: Partial<DownloadSettings>
  ): Promise<void> {
    await this.initialize();

    if (!this.settings) {
      await this.loadSettings();
    }

    this.settings = { ...this.settings!, ...newSettings };
    await this.saveSettings();

    // If storage limit was reduced, check if cleanup is needed
    if (newSettings.maxStorageSize) {
      await this.performStorageCheck();
    }
  }

  async getDetailedStorageStats(): Promise<
    StorageStats & {
      usageStats: StorageUsageStats;
      storageBreakdown: {
        [mangaId: string]: { chapters: number; totalSize: number };
      };
      recentlyAccessed: Array<{
        mangaId: string;
        chapterNumber: string;
        lastAccess: number;
      }>;
    }
  > {
    await this.initialize();

    const basicStats = await this.getStorageStats();

    // Calculate storage breakdown by manga
    const storageBreakdown: {
      [mangaId: string]: { chapters: number; totalSize: number };
    } = {};

    for (const [mangaId, chapters] of Object.entries(this.metadata)) {
      let mangaTotalSize = 0;
      let chapterCount = 0;

      for (const metadata of Object.values(chapters)) {
        mangaTotalSize += metadata.totalSize;
        chapterCount++;
      }

      storageBreakdown[mangaId] = {
        chapters: chapterCount,
        totalSize: mangaTotalSize,
      };
    }

    // Get recently accessed chapters
    const recentlyAccessed: Array<{
      mangaId: string;
      chapterNumber: string;
      lastAccess: number;
    }> = [];

    if (this.usageStats) {
      for (const [mangaId, chapters] of Object.entries(
        this.usageStats.lastAccessTimes
      )) {
        for (const [chapterNumber, lastAccess] of Object.entries(chapters)) {
          recentlyAccessed.push({ mangaId, chapterNumber, lastAccess });
        }
      }

      // Sort by most recent access
      recentlyAccessed.sort((a, b) => b.lastAccess - a.lastAccess);
    }

    return {
      ...basicStats,
      usageStats: this.usageStats || {
        lastAccessTimes: {},
        accessCounts: {},
        lastCleanup: 0,
        totalDownloadsEver: 0,
        totalSizeDownloadedEver: 0,
      },
      storageBreakdown,
      recentlyAccessed: recentlyAccessed.slice(0, 20), // Top 20 most recent
    };
  }

  async checkStorageHealth(): Promise<{
    needsCleanup: boolean;
    criticallyLow: boolean;
    recommendedAction: string;
    storageUsagePercent: number;
  }> {
    await this.initialize();

    const stats = await this.getStorageStats();
    const maxSize = this.settings?.maxStorageSize || DEFAULT_MAX_STORAGE_SIZE;
    const usagePercent = (stats.totalSize / maxSize) * 100;

    let needsCleanup = false;
    let criticallyLow = false;
    let recommendedAction = 'No action needed';

    if (stats.availableSpace < MIN_FREE_SPACE) {
      criticallyLow = true;
      recommendedAction =
        'Critical: Delete downloads immediately to free space';
    } else if (usagePercent > CLEANUP_THRESHOLD * 100) {
      needsCleanup = true;
      recommendedAction = 'Recommended: Clean up old or unused downloads';
    } else if (usagePercent > 60) {
      recommendedAction = 'Consider reviewing downloaded content';
    }

    return {
      needsCleanup,
      criticallyLow,
      recommendedAction,
      storageUsagePercent: usagePercent,
    };
  }

  async performManualCleanup(
    options: {
      olderThanDays?: number;
      leastAccessedCount?: number;
      specificManga?: string[];
    } = {}
  ): Promise<{
    deletedChapters: number;
    freedSpace: number;
  }> {
    await this.initialize();

    let deletedChapters = 0;
    let freedSpace = 0;
    const now = Date.now();

    try {
      const chaptersToDelete: Array<{
        mangaId: string;
        chapterNumber: string;
        metadata: ChapterMetadata;
      }> = [];

      // Filter chapters based on options
      for (const [mangaId, chapters] of Object.entries(this.metadata)) {
        // Skip if specific manga list provided and this manga is not in it
        if (options.specificManga && !options.specificManga.includes(mangaId)) {
          continue;
        }

        for (const [chapterNumber, metadata] of Object.entries(chapters)) {
          let shouldDelete = false;

          // Check age criteria
          if (options.olderThanDays) {
            const ageInDays =
              (now - metadata.downloadedAt) / (1000 * 60 * 60 * 24);
            if (ageInDays > options.olderThanDays) {
              shouldDelete = true;
            }
          }

          if (shouldDelete) {
            chaptersToDelete.push({ mangaId, chapterNumber, metadata });
          }
        }
      }

      // Handle least accessed criteria
      if (options.leastAccessedCount && this.usageStats) {
        const allChapters = this.getChaptersWithUsageData();

        // Sort by access count (ascending) and last access time (ascending)
        allChapters.sort((a, b) => {
          const aAccessCount =
            this.usageStats!.accessCounts[a.mangaId]?.[a.chapterNumber] || 0;
          const bAccessCount =
            this.usageStats!.accessCounts[b.mangaId]?.[b.chapterNumber] || 0;
          const aLastAccess =
            this.usageStats!.lastAccessTimes[a.mangaId]?.[a.chapterNumber] || 0;
          const bLastAccess =
            this.usageStats!.lastAccessTimes[b.mangaId]?.[b.chapterNumber] || 0;

          if (aAccessCount !== bAccessCount) {
            return aAccessCount - bAccessCount;
          }
          return aLastAccess - bLastAccess;
        });

        // Add least accessed chapters to deletion list
        const leastAccessedToDelete = allChapters.slice(
          0,
          options.leastAccessedCount
        );
        for (const chapter of leastAccessedToDelete) {
          if (
            !chaptersToDelete.some(
              (c) =>
                c.mangaId === chapter.mangaId &&
                c.chapterNumber === chapter.chapterNumber
            )
          ) {
            chaptersToDelete.push(chapter);
          }
        }
      }

      // Perform deletions
      for (const chapter of chaptersToDelete) {
        try {
          const chapterSize = chapter.metadata.totalSize;
          await this.deleteChapter(chapter.mangaId, chapter.chapterNumber);
          deletedChapters++;
          freedSpace += chapterSize;
        } catch (error) {
          console.error(
            `Failed to delete chapter during manual cleanup:`,
            error
          );
        }
      }

      if (isDebugEnabled() && deletedChapters > 0) {
        console.log(
          `Manual cleanup completed. Deleted ${deletedChapters} chapters, freed ${Math.round(freedSpace / 1024 / 1024)}MB`
        );
      }

      return { deletedChapters, freedSpace };
    } catch (error) {
      console.error('Failed to perform manual cleanup:', error);
      return { deletedChapters, freedSpace };
    }
  }
}

// Export singleton instance
export const chapterStorageService = ChapterStorage.getInstance();
