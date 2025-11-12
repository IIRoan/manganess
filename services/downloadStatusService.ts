import { downloadManagerService } from './downloadManager';
import { chapterStorageService } from './chapterStorageService';
import { downloadQueueService } from './downloadQueue';
import { DownloadStatus, DownloadProgress } from '@/types/download';
import { logger } from '@/utils/logger';

export interface ChapterDownloadStatus {
  mangaId: string;
  chapterNumber: string;
  status: DownloadStatus;
  isDownloaded: boolean;
  isDownloading: boolean;
  isQueued: boolean;
  isFailed: boolean;
  isPaused: boolean;
  progress: number;
  estimatedTimeRemaining?: number | undefined;
  downloadSpeed?: number | undefined;
}

export interface BatchDownloadStatusRequest {
  items: Array<{
    mangaId: string;
    chapterNumber: string;
  }>;
}

export interface BatchDownloadStatusResponse {
  statuses: ChapterDownloadStatus[];
  summary: {
    total: number;
    downloaded: number;
    downloading: number;
    queued: number;
    failed: number;
    paused: number;
  };
}

class DownloadStatusService {
  private static instance: DownloadStatusService;
  private log = logger();
  private statusCache: Map<string, ChapterDownloadStatus> = new Map();
  private cacheExpiry: Map<string, number> = new Map();
  private readonly CACHE_TTL = 1000; // 1 second cache TTL

  private constructor() {}

  static getInstance(): DownloadStatusService {
    if (!DownloadStatusService.instance) {
      DownloadStatusService.instance = new DownloadStatusService();
    }
    return DownloadStatusService.instance;
  }

  private getCacheKey(mangaId: string, chapterNumber: string): string {
    return `${mangaId}_${chapterNumber}`;
  }

  private isCacheValid(key: string): boolean {
    const expiry = this.cacheExpiry.get(key);
    return expiry ? Date.now() < expiry : false;
  }

  private setCache(key: string, status: ChapterDownloadStatus): void {
    this.statusCache.set(key, status);
    this.cacheExpiry.set(key, Date.now() + this.CACHE_TTL);
  }

  private getFromCache(key: string): ChapterDownloadStatus | null {
    if (this.isCacheValid(key)) {
      return this.statusCache.get(key) || null;
    }
    return null;
  }

  private clearCache(key?: string): void {
    if (key) {
      this.statusCache.delete(key);
      this.cacheExpiry.delete(key);
    } else {
      this.statusCache.clear();
      this.cacheExpiry.clear();
    }
  }

  /**
   * Get download status for a single chapter
   */
  async getChapterDownloadStatus(
    mangaId: string,
    chapterNumber: string
  ): Promise<ChapterDownloadStatus> {
    const cacheKey = this.getCacheKey(mangaId, chapterNumber);
    
    // Check cache first
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Check if chapter is downloaded first (fastest check)
      const isDownloaded = await chapterStorageService.isChapterDownloaded(
        mangaId,
        chapterNumber
      );

      if (isDownloaded) {
        const status: ChapterDownloadStatus = {
          mangaId,
          chapterNumber,
          status: DownloadStatus.COMPLETED,
          isDownloaded: true,
          isDownloading: false,
          isQueued: false,
          isFailed: false,
          isPaused: false,
          progress: 100,
        };

        this.setCache(cacheKey, status);
        return status;
      }

      // Check download queue status
      const downloadId = this.getCacheKey(mangaId, chapterNumber);
      const queueItem = await downloadQueueService.getDownloadById(downloadId);
      
      if (queueItem) {
        const queueStatus = queueItem.status;
        
        // Get progress if downloading
        let progress: number = 0;
        let estimatedTimeRemaining: number | undefined;
        let downloadSpeed: number | undefined;

        if (queueStatus === DownloadStatus.DOWNLOADING) {
          const progressData = downloadManagerService.getDownloadProgress(downloadId);
          if (progressData) {
            progress = progressData.progress;
            estimatedTimeRemaining = progressData.estimatedTimeRemaining;
            downloadSpeed = progressData.downloadSpeed;
          }
        }

        const status: ChapterDownloadStatus = {
          mangaId,
          chapterNumber,
          status: queueStatus,
          isDownloaded: false,
          isDownloading: queueStatus === DownloadStatus.DOWNLOADING,
          isQueued: queueStatus === DownloadStatus.QUEUED,
          isFailed: queueStatus === DownloadStatus.FAILED,
          isPaused: queueStatus === DownloadStatus.PAUSED,
          progress,
          estimatedTimeRemaining,
          downloadSpeed,
        };

        this.setCache(cacheKey, status);
        return status;
      }

      // Check if actively downloading (might not be in queue yet)
      const activeDownloads = await downloadManagerService.getActiveDownloads();
      const activeDownload = activeDownloads.find(d => d.id.includes(downloadId));
      
      if (activeDownload) {
        const progressData = downloadManagerService.getDownloadProgress(downloadId);
        
        const status: ChapterDownloadStatus = {
          mangaId,
          chapterNumber,
          status: DownloadStatus.DOWNLOADING,
          isDownloaded: false,
          isDownloading: true,
          isQueued: false,
          isFailed: false,
          isPaused: false,
          progress: progressData?.progress || 0,
          estimatedTimeRemaining: progressData?.estimatedTimeRemaining,
          downloadSpeed: progressData?.downloadSpeed,
        };

        this.setCache(cacheKey, status);
        return status;
      }

      // Check for any download containing the mangaId and chapterNumber in different formats
      const alternativeActiveDownload = activeDownloads.find(d => 
        (d.mangaId === mangaId && d.chapterNumber === chapterNumber)
      );
      
      if (alternativeActiveDownload) {
        const progressData = downloadManagerService.getDownloadProgress(alternativeActiveDownload.id);
        
        const status: ChapterDownloadStatus = {
          mangaId,
          chapterNumber,
          status: DownloadStatus.DOWNLOADING,
          isDownloaded: false,
          isDownloading: true,
          isQueued: false,
          isFailed: false,
          isPaused: false,
          progress: progressData?.progress || 0,
          estimatedTimeRemaining: progressData?.estimatedTimeRemaining,
          downloadSpeed: progressData?.downloadSpeed,
        };

        this.setCache(cacheKey, status);
        return status;
      }

      // Default to queued status
      const status: ChapterDownloadStatus = {
        mangaId,
        chapterNumber,
        status: DownloadStatus.QUEUED,
        isDownloaded: false,
        isDownloading: false,
        isQueued: true,
        isFailed: false,
        isPaused: false,
        progress: 0,
      };

      this.setCache(cacheKey, status);
      return status;

    } catch (error) {
      this.log.error('Service', 'Error getting chapter download status', {
        mangaId,
        chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return failed status on error
      const failedStatus: ChapterDownloadStatus = {
        mangaId,
        chapterNumber,
        status: DownloadStatus.FAILED,
        isDownloaded: false,
        isDownloading: false,
        isQueued: false,
        isFailed: true,
        isPaused: false,
        progress: 0,
      };

      return failedStatus;
    }
  }

  /**
   * Get download status for multiple chapters in batch
   */
  async getBatchDownloadStatus(
    request: BatchDownloadStatusRequest
  ): Promise<BatchDownloadStatusResponse> {
    const statuses: ChapterDownloadStatus[] = [];

    // Process requests in parallel for better performance
    const promises = request.items.map(async ({ mangaId, chapterNumber }) => {
      try {
        return await this.getChapterDownloadStatus(mangaId, chapterNumber);
      } catch (error) {
        this.log.error('Service', 'Error getting batch download status', {
          mangaId,
          chapterNumber,
          error: error instanceof Error ? error.message : String(error),
        });

        // Return failed status for this item
        return {
          mangaId,
          chapterNumber,
          status: DownloadStatus.FAILED,
          isDownloaded: false,
          isDownloading: false,
          isQueued: false,
          isFailed: true,
          isPaused: false,
          progress: 0,
        } as ChapterDownloadStatus;
      }
    });

    const results = await Promise.all(promises);
    statuses.push(...results);

    // Calculate summary
    const summary = {
      total: statuses.length,
      downloaded: statuses.filter(s => s.isDownloaded).length,
      downloading: statuses.filter(s => s.isDownloading).length,
      queued: statuses.filter(s => s.isQueued).length,
      failed: statuses.filter(s => s.isFailed).length,
      paused: statuses.filter(s => s.isPaused).length,
    };

    return {
      statuses,
      summary,
    };
  }

  /**
   * Get all downloaded chapters for a manga
   */
  async getDownloadedChapters(mangaId: string): Promise<string[]> {
    try {
      return await chapterStorageService.getDownloadedChapters(mangaId);
    } catch (error) {
      this.log.error('Service', 'Error getting downloaded chapters', {
        mangaId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Check if any chapters are currently downloading for a manga
   */
  async isDownloadingChapters(mangaId: string): Promise<boolean> {
    try {
      const activeDownloads = await downloadManagerService.getActiveDownloads();
      return activeDownloads.some(d => d.mangaId === mangaId);
    } catch (error) {
      this.log.error('Service', 'Error checking downloading chapters', {
        mangaId,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get download progress for a specific download
   */
  getDownloadProgress(mangaId: string, chapterNumber: string): DownloadProgress | null {
    const downloadId = this.getCacheKey(mangaId, chapterNumber);
    return downloadManagerService.getDownloadProgress(downloadId);
  }

  /**
   * Subscribe to download progress updates
   */
  subscribeToProgress(
    mangaId: string,
    chapterNumber: string,
    callback: (progress: DownloadProgress) => void
  ): () => void {
    const downloadId = this.getCacheKey(mangaId, chapterNumber);
    return downloadManagerService.addProgressListener(downloadId, callback);
  }

  /**
   * Clear cache for a specific chapter or all chapters
   */
  clearCacheForChapter(mangaId?: string, chapterNumber?: string): void {
    if (mangaId && chapterNumber) {
      const key = this.getCacheKey(mangaId, chapterNumber);
      this.clearCache(key);
    } else {
      this.clearCache();
    }
  }

  /**
   * Force refresh download status for a chapter
   */
  async refreshStatus(mangaId: string, chapterNumber: string): Promise<ChapterDownloadStatus> {
    const cacheKey = this.getCacheKey(mangaId, chapterNumber);
    this.clearCache(cacheKey);
    return this.getChapterDownloadStatus(mangaId, chapterNumber);
  }

  /**
   * Get simplified download status (just the enum)
   */
  async getSimpleStatus(mangaId: string, chapterNumber: string): Promise<DownloadStatus> {
    const status = await this.getChapterDownloadStatus(mangaId, chapterNumber);
    return status.status;
  }

  /**
   * Check if chapter is downloaded (boolean check)
   */
  async isChapterDownloaded(mangaId: string, chapterNumber: string): Promise<boolean> {
    const status = await this.getChapterDownloadStatus(mangaId, chapterNumber);
    return status.isDownloaded;
  }

  /**
   * Check if chapter is currently downloading (boolean check)
   */
  async isChapterDownloading(mangaId: string, chapterNumber: string): Promise<boolean> {
    const status = await this.getChapterDownloadStatus(mangaId, chapterNumber);
    return status.isDownloading;
  }
}

// Export singleton instance
export const downloadStatusService = DownloadStatusService.getInstance();
