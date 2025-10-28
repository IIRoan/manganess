import { downloadManagerService } from './downloadManager';
import { chapterStorageService } from './chapterStorageService';
// Removed unused import
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';

interface BatchDownloadOptions {
  maxConcurrent?: number;
  delayBetweenBatches?: number;
  onProgress?: (completed: number, total: number, current?: string) => void;
  onError?: (error: Error, mangaId: string, chapterNumber: string) => void;
}

interface BatchDownloadResult {
  success: boolean;
  totalChapters: number;
  successfulDownloads: number;
  failedDownloads: number;
  errors: Array<{
    mangaId: string;
    chapterNumber: string;
    error: string;
  }>;
}

class DownloadBatchManager {
  private static instance: DownloadBatchManager;
  private log = logger();
  private activeBatches = new Set<string>();

  private constructor() {}

  static getInstance(): DownloadBatchManager {
    if (!DownloadBatchManager.instance) {
      DownloadBatchManager.instance = new DownloadBatchManager();
    }
    return DownloadBatchManager.instance;
  }

  /**
   * Download multiple chapters with batching to prevent UI blocking
   */
  async downloadChaptersBatch(
    chapters: Array<{
      mangaId: string;
      chapterNumber: string;
      chapterUrl: string;
    }>,
    options: BatchDownloadOptions = {}
  ): Promise<BatchDownloadResult> {
    const {
      maxConcurrent = 2, // Reduced from 3 to prevent overwhelming
      delayBetweenBatches = 500, // 500ms delay between batches
      onProgress,
      onError,
    } = options;

    const batchId = `batch_${Date.now()}`;
    this.activeBatches.add(batchId);

    const result: BatchDownloadResult = {
      success: true,
      totalChapters: chapters.length,
      successfulDownloads: 0,
      failedDownloads: 0,
      errors: [],
    };

    if (isDebugEnabled()) {
      this.log.info('Service', 'Starting batch download', {
        batchId,
        totalChapters: chapters.length,
        maxConcurrent,
      });
    }

    try {
      // Initialize storage service asynchronously
      await chapterStorageService.initialize();

      // Filter out already downloaded chapters
      const chaptersToDownload = await this.filterAlreadyDownloaded(chapters);

      if (chaptersToDownload.length === 0) {
        if (isDebugEnabled()) {
          this.log.info('Service', 'All chapters already downloaded', {
            batchId,
          });
        }
        result.successfulDownloads = chapters.length;
        return result;
      }

      // Process chapters in batches
      for (let i = 0; i < chaptersToDownload.length; i += maxConcurrent) {
        if (!this.activeBatches.has(batchId)) {
          // Batch was cancelled
          break;
        }

        const batch = chaptersToDownload.slice(i, i + maxConcurrent);

        if (isDebugEnabled()) {
          this.log.info('Service', 'Processing batch', {
            batchId,
            batchNumber: Math.floor(i / maxConcurrent) + 1,
            batchSize: batch.length,
          });
        }

        // Process batch concurrently but with limited concurrency
        const batchPromises = batch.map(async (chapter) => {
          try {
            const downloadResult = await downloadManagerService.downloadChapter(
              chapter.mangaId,
              chapter.chapterNumber,
              chapter.chapterUrl
            );

            if (downloadResult.success) {
              result.successfulDownloads++;
            } else {
              result.failedDownloads++;
              const errorMessage =
                downloadResult.error?.message || 'Unknown error';
              result.errors.push({
                mangaId: chapter.mangaId,
                chapterNumber: chapter.chapterNumber,
                error: errorMessage,
              });

              if (onError) {
                onError(
                  new Error(errorMessage),
                  chapter.mangaId,
                  chapter.chapterNumber
                );
              }
            }

            // Update progress
            if (onProgress) {
              const completed =
                result.successfulDownloads + result.failedDownloads;
              onProgress(
                completed,
                result.totalChapters,
                chapter.chapterNumber
              );
            }

            return downloadResult;
          } catch (error) {
            result.failedDownloads++;
            const errorMessage =
              error instanceof Error ? error.message : 'Unknown error';
            result.errors.push({
              mangaId: chapter.mangaId,
              chapterNumber: chapter.chapterNumber,
              error: errorMessage,
            });

            if (onError) {
              onError(
                error instanceof Error ? error : new Error(errorMessage),
                chapter.mangaId,
                chapter.chapterNumber
              );
            }

            // Update progress
            if (onProgress) {
              const completed =
                result.successfulDownloads + result.failedDownloads;
              onProgress(
                completed,
                result.totalChapters,
                chapter.chapterNumber
              );
            }

            return { success: false, error: { message: errorMessage } };
          }
        });

        // Wait for batch to complete
        await Promise.allSettled(batchPromises);

        // Add delay between batches to prevent overwhelming the system
        if (
          i + maxConcurrent < chaptersToDownload.length &&
          delayBetweenBatches > 0
        ) {
          await this.delay(delayBetweenBatches);
        }
      }

      // Determine overall success
      result.success = result.failedDownloads === 0;

      if (isDebugEnabled()) {
        this.log.info('Service', 'Batch download completed', {
          batchId,
          success: result.success,
          successful: result.successfulDownloads,
          failed: result.failedDownloads,
          total: result.totalChapters,
        });
      }

      return result;
    } catch (error) {
      this.log.error('Service', 'Batch download failed', {
        batchId,
        error,
      });

      result.success = false;
      return result;
    } finally {
      this.activeBatches.delete(batchId);
    }
  }

  /**
   * Cancel an active batch download
   */
  async cancelBatch(batchId: string): Promise<void> {
    this.activeBatches.delete(batchId);

    if (isDebugEnabled()) {
      this.log.info('Service', 'Batch download cancelled', { batchId });
    }
  }

  /**
   * Filter out chapters that are already downloaded
   */
  private async filterAlreadyDownloaded(
    chapters: Array<{
      mangaId: string;
      chapterNumber: string;
      chapterUrl: string;
    }>
  ): Promise<
    Array<{
      mangaId: string;
      chapterNumber: string;
      chapterUrl: string;
    }>
  > {
    const filtered = [];

    for (const chapter of chapters) {
      try {
        const isDownloaded = await chapterStorageService.isChapterDownloaded(
          chapter.mangaId,
          chapter.chapterNumber
        );

        if (!isDownloaded) {
          filtered.push(chapter);
        }
      } catch (error) {
        // If we can't check, assume it needs to be downloaded
        filtered.push(chapter);
      }
    }

    return filtered;
  }

  /**
   * Get status of all active batches
   */
  getActiveBatches(): string[] {
    return Array.from(this.activeBatches);
  }

  /**
   * Check if any batch is currently active
   */
  hasActiveBatches(): boolean {
    return this.activeBatches.size > 0;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const downloadBatchManager = DownloadBatchManager.getInstance();
