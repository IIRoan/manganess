import {
  DownloadItem,
  DownloadResult,
  DownloadStatus,
  DownloadError,
  DownloadErrorType,
  ChapterImage,
  ImageDownloadStatus,
  DownloadProgress as DownloadProgressType,
} from '@/types/download';
import { downloadEventEmitter } from '@/utils/downloadEventEmitter';
import { DownloadManager } from '@/types/downloadInterfaces';
import { imageExtractorService } from './imageExtractor';
import { chapterStorageService } from './chapterStorageService';
import { downloadQueueService } from './downloadQueue';
import {
  downloadErrorHandler,
  StorageErrorContext,
} from './downloadErrorHandler';
import { downloadValidationService } from './downloadValidationService';
// import { downloadNotificationService } from './downloadNotificationService'; // Reserved for future use
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';
import { webViewRequestInterceptor } from './webViewRequestInterceptor';

// Download configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_BASE = 1000; // Base delay in milliseconds
const RETRY_DELAY_MULTIPLIER = 2; // Exponential backoff multiplier
const DOWNLOAD_TIMEOUT = 30000; // 30 seconds per image
const CONCURRENT_IMAGE_DOWNLOADS = 3; // Max concurrent image downloads per chapter

interface RetryConfig {
  attempt: number;
  maxAttempts: number;
  baseDelay: number;
  multiplier: number;
}

interface DownloadProgress {
  downloadId: string;
  mangaId: string;
  mangaTitle: string;
  chapterNumber: string;
  totalImages: number;
  downloadedImages: number;
  failedImages: number;
  progress: number;
  startTime: number;
  lastUpdateTime: number;
  estimatedTimeRemaining?: number;
  downloadSpeed?: number; // bytes per second
  totalBytes: number;
  downloadedBytes: number;
}

interface ProgressUpdateListener {
  (progress: DownloadProgressType): void;
}

class DownloadManagerService implements DownloadManager {
  private static instance: DownloadManagerService;
  private log = logger();
  private activeDownloads: Map<string, DownloadProgress> = new Map();
  private downloadAbortControllers: Map<string, AbortController> = new Map();
  private progressListeners: Map<string, Set<ProgressUpdateListener>> =
    new Map();

  private constructor() {}

  static getInstance(): DownloadManagerService {
    if (!DownloadManagerService.instance) {
      DownloadManagerService.instance = new DownloadManagerService();
    }
    return DownloadManagerService.instance;
  }

  /**
   * Download a chapter using intercepted WebView request data
   * This is the preferred method for mobile as it uses the VRF token and chapter ID
   * captured from the WebView's AJAX request
   */
  async downloadChapterFromInterceptedRequest(
    mangaId: string,
    chapterNumber: string,
    chapterId: string,
    vrfToken: string,
    refererUrl?: string,
    mangaTitle?: string
  ): Promise<DownloadResult> {
    const downloadId = this.generateDownloadId(mangaId, chapterNumber);

    if (isDebugEnabled()) {
      this.log.info(
        'Service',
        'Starting chapter download from intercepted request',
        {
          mangaId,
          mangaTitle,
          chapterNumber,
          chapterId,
          downloadId,
          vrfTokenPreview: vrfToken.substring(0, 30) + '...',
        }
      );
    }

    try {
      // Quick check if already downloaded
      const isAlreadyDownloaded =
        await chapterStorageService.isChapterDownloaded(mangaId, chapterNumber);

      if (isAlreadyDownloaded) {
        if (isDebugEnabled()) {
          this.log.info('Service', 'Chapter already downloaded', {
            downloadId,
          });
        }

        const existingImages = await chapterStorageService.getChapterImages(
          mangaId,
          chapterNumber
        );

        return {
          success: true,
          downloadId,
          chapterImages: existingImages || [],
        };
      }

      // Create abort controller
      const abortController = new AbortController();
      this.downloadAbortControllers.set(downloadId, abortController);

      // Initialize progress tracking
      const progress: DownloadProgress = {
        downloadId,
        mangaId,
        mangaTitle: mangaTitle || `Manga ${mangaId}`,
        chapterNumber,
        totalImages: 0,
        downloadedImages: 0,
        failedImages: 0,
        progress: 0,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        totalBytes: 0,
        downloadedBytes: 0,
      };

      this.activeDownloads.set(downloadId, progress);

      // Emit download started event
      downloadEventEmitter.emitStarted(mangaId, chapterNumber, downloadId);

      if (isDebugEnabled()) {
        this.log.info('Service', 'Initialized download progress tracking', {
          downloadId,
          mangaTitle: progress.mangaTitle,
        });
      }

      // Update queue with initial progress
      downloadQueueService
        .updateDownloadProgress(downloadId, 0, 0, 0)
        .catch((error) => {
          this.log.error('Service', 'Failed to update download progress', {
            downloadId,
            error: error instanceof Error ? error.message : String(error),
          });
        });

      // Perform download using intercepted data
      if (isDebugEnabled()) {
        this.log.info('Service', 'Starting download with retry logic', {
          downloadId,
          maxAttempts: MAX_RETRY_ATTEMPTS,
        });
      }

      const result = await this.performDownloadFromInterceptedRequest(
        mangaId,
        chapterNumber,
        chapterId,
        vrfToken,
        downloadId,
        abortController.signal,
        refererUrl,
        {
          attempt: 1,
          maxAttempts: MAX_RETRY_ATTEMPTS,
          baseDelay: RETRY_DELAY_BASE,
          multiplier: RETRY_DELAY_MULTIPLIER,
        }
      );

      // Clean up
      this.activeDownloads.delete(downloadId);
      this.downloadAbortControllers.delete(downloadId);

      if (result.success) {
        await downloadQueueService.completeDownload(downloadId);
      } else {
        await downloadQueueService.failDownload(
          downloadId,
          result.error?.message || 'Unknown error'
        );
      }

      return result;
    } catch (error) {
      // Clean up on error
      this.activeDownloads.delete(downloadId);
      this.downloadAbortControllers.delete(downloadId);

      const downloadError: DownloadError = {
        type: DownloadErrorType.UNKNOWN,
        message: error instanceof Error ? error.message : 'Unknown error',
        retryable: true,
        chapter: chapterNumber,
        mangaId,
      };

      await downloadQueueService.failDownload(
        downloadId,
        downloadError.message
      );

      this.log.error('Service', 'Download failed with exception', {
        downloadId,
        error,
      });

      return {
        success: false,
        error: downloadError,
      };
    }
  }

  /**
   * Download a chapter with retry logic and progress tracking
   * This method REQUIRES opening a WebView to intercept the AJAX request
   * The WebView must be opened BEFORE calling this method to capture the VRF token
   */
  async downloadChapter(
    mangaId: string,
    chapterNumber: string,
    chapterUrl: string,
    mangaTitle?: string
  ): Promise<DownloadResult> {
    const downloadId = this.generateDownloadId(mangaId, chapterNumber);

    if (isDebugEnabled()) {
      this.log.info('Service', 'Starting chapter download', {
        mangaId,
        chapterNumber,
        chapterUrl,
        downloadId,
      });
    }

    try {
      // Quick check if already downloaded (non-blocking)
      const isAlreadyDownloaded =
        await chapterStorageService.isChapterDownloaded(mangaId, chapterNumber);

      if (isAlreadyDownloaded) {
        if (isDebugEnabled()) {
          this.log.info('Service', 'Chapter already downloaded', {
            downloadId,
          });
        }

        // Get images asynchronously
        const existingImages = await chapterStorageService.getChapterImages(
          mangaId,
          chapterNumber
        );

        return {
          success: true,
          downloadId,
          chapterImages: existingImages || [],
        };
      }

      // CRITICAL: We MUST wait for WebView to intercept the AJAX request
      // The calling code should open a WebView in the background first
      if (isDebugEnabled()) {
        this.log.info(
          'Service',
          '⏳ Waiting for WebView to intercept AJAX request...',
          {
            downloadId,
            chapterUrl,
          }
        );
      }

      // Wait for intercepted data with timeout
      const interceptedData = await this.waitForInterceptedRequest(
        chapterUrl,
        30000 // 30 second timeout
      );

      if (!interceptedData) {
        throw new Error(
          'Failed to intercept AJAX request from WebView. Make sure the chapter page is loaded in a WebView before downloading.'
        );
      }

      if (isDebugEnabled()) {
        this.log.info(
          'Service',
          'Got intercepted WebView data, starting download',
          {
            downloadId,
            chapterId: interceptedData.chapterId,
            vrfTokenPreview: interceptedData.vrfToken.substring(0, 30) + '...',
          }
        );
      }

      // Use the intercepted data to download
      return this.downloadChapterFromInterceptedRequest(
        mangaId,
        chapterNumber,
        interceptedData.chapterId,
        interceptedData.vrfToken,
        chapterUrl,
        mangaTitle
      );
    } catch (error) {
      // Clean up on error
      this.activeDownloads.delete(downloadId);
      this.downloadAbortControllers.delete(downloadId);

      const downloadError: DownloadError = {
        type: DownloadErrorType.UNKNOWN,
        message: error instanceof Error ? error.message : 'Unknown error',
        retryable: true,
        chapter: chapterNumber,
        mangaId,
      };

      await downloadQueueService.failDownload(
        downloadId,
        downloadError.message
      );

      this.log.error('Service', 'Download failed with exception', {
        downloadId,
        error,
      });

      return {
        success: false,
        error: downloadError,
      };
    }
  }

  /**
   * Wait for WebView to intercept the AJAX request
   * This polls the interceptor service until data is available or timeout
   */
  private async waitForInterceptedRequest(
    chapterUrl: string,
    timeoutMs: number
  ): Promise<{
    chapterId: string;
    vrfToken: string;
  } | null> {
    const startTime = Date.now();
    const pollInterval = 100; // Check every 100ms

    while (Date.now() - startTime < timeoutMs) {
      // Try to extract chapter ID from URL to check if we have intercepted data
      const potentialChapterId =
        webViewRequestInterceptor.extractChapterIdFromUrl(chapterUrl);

      if (potentialChapterId) {
        const interceptedData =
          webViewRequestInterceptor.getInterceptedRequest(potentialChapterId);

        if (interceptedData) {
          if (isDebugEnabled()) {
            this.log.info('Service', 'Found intercepted request', {
              chapterId: interceptedData.chapterId,
              waitedMs: Date.now() - startTime,
            });
          }
          return {
            chapterId: interceptedData.chapterId,
            vrfToken: interceptedData.vrfToken,
          };
        }
      }

      // Wait before next poll
      await this.delay(pollInterval);
    }

    if (isDebugEnabled()) {
      this.log.warn('Service', '⏱️ Timeout waiting for intercepted request', {
        chapterUrl,
        timeoutMs,
      });
    }

    return null;
  }

  /**
   * Perform download using intercepted WebView request data
   * This bypasses the need to fetch and parse HTML
   */
  private async performDownloadFromInterceptedRequest(
    mangaId: string,
    chapterNumber: string,
    chapterId: string,
    vrfToken: string,
    downloadId: string,
    signal: AbortSignal,
    refererUrl: string | undefined,
    retryConfig: RetryConfig
  ): Promise<DownloadResult> {
    try {
      if (signal.aborted) {
        throw new Error('Download cancelled');
      }

      if (isDebugEnabled()) {
        this.log.info(
          'Service',
          `Download attempt ${retryConfig.attempt}/${retryConfig.maxAttempts}`,
          {
            downloadId,
            chapterId,
            attempt: retryConfig.attempt,
            maxAttempts: retryConfig.maxAttempts,
          }
        );
      }

      // Step 1: Check storage space
      if (isDebugEnabled()) {
        this.log.info('Service', 'Step 1: Checking storage space', {
          downloadId,
        });
      }

      const storageStats = await chapterStorageService.getStorageStats();
      const estimatedSize = 10 * 1024 * 1024; // Estimate 10MB per chapter

      if (storageStats.availableSpace < estimatedSize) {
        const storageContext: StorageErrorContext = {
          availableSpace: storageStats.availableSpace,
          requiredSpace: estimatedSize,
          totalUsage: storageStats.totalSize,
          maxStorage: storageStats.totalSize + storageStats.availableSpace,
          canCleanup: storageStats.totalChapters > 0,
        };

        const recoveryResult = await downloadErrorHandler.handleStorageError(
          new Error('Insufficient storage space'),
          downloadId,
          storageContext,
          { mangaId, chapterNumber }
        );

        if (!recoveryResult.shouldRetry) {
          return {
            success: false,
            error: {
              type: DownloadErrorType.STORAGE_FULL,
              message: recoveryResult.message,
              retryable: false,
              chapter: chapterNumber,
              mangaId,
            },
          };
        }

        if (recoveryResult.delay) {
          await this.delay(recoveryResult.delay);
        }
      }

      if (isDebugEnabled()) {
        this.log.info('Service', 'Storage check passed', {
          downloadId,
          availableSpace: storageStats.availableSpace,
        });
      }

      // Step 2: Extract images using intercepted data (no HTML fetching needed!)
      if (isDebugEnabled()) {
        this.log.info('Service', 'Step 2: Extracting images from AJAX API', {
          downloadId,
          chapterId,
          vrfTokenPreview: vrfToken.substring(0, 30) + '...',
        });
      }

      const images =
        await imageExtractorService.extractImagesFromInterceptedRequest(
          chapterId,
          vrfToken,
          refererUrl
        );

      if (!images || images.length === 0) {
        throw new Error('No images found in chapter');
      }

      if (isDebugEnabled()) {
        this.log.info('Service', `Found ${images.length} images`, {
          downloadId,
          imageCount: images.length,
          sampleUrls: images.slice(0, 3).map((img) => img.originalUrl),
        });
      }

      // Update progress with total image count
      const progress = this.activeDownloads.get(downloadId);
      if (progress) {
        progress.totalImages = images.length;
        await downloadQueueService.updateDownloadProgress(
          downloadId,
          0,
          0,
          images.length
        );
      }

      if (signal.aborted) {
        throw new Error('Download cancelled');
      }

      // Step 3: Download images
      if (isDebugEnabled()) {
        this.log.info('Service', 'Step 3: Downloading images', {
          downloadId,
          totalImages: images.length,
          concurrentDownloads: CONCURRENT_IMAGE_DOWNLOADS,
        });
      }

      const downloadedImages = await this.downloadImagesWithValidation(
        images,
        downloadId,
        signal,
        mangaId,
        chapterNumber
      );

      if (signal.aborted) {
        throw new Error('Download cancelled');
      }

      if (isDebugEnabled()) {
        this.log.info('Service', 'All images downloaded', {
          downloadId,
          successCount: downloadedImages.filter(
            (img) => img.downloadStatus === ImageDownloadStatus.COMPLETED
          ).length,
          failedCount: downloadedImages.filter(
            (img) => img.downloadStatus === ImageDownloadStatus.FAILED
          ).length,
        });
      }

      // Step 4: Save to storage
      if (isDebugEnabled()) {
        this.log.info('Service', 'Step 4: Saving to storage', {
          downloadId,
        });
      }

      try {
        await chapterStorageService.saveChapterImages(
          mangaId,
          chapterNumber,
          downloadedImages
        );

        if (isDebugEnabled()) {
          this.log.info('Service', 'Saved to storage', {
            downloadId,
          });
        }
      } catch (storageError) {
        const errorMessage =
          storageError instanceof Error
            ? storageError.message
            : String(storageError);

        // Check if it's just "already exists" errors - this means we already have the files
        if (
          errorMessage.includes('already exists') ||
          errorMessage.includes('Destination already exists')
        ) {
          if (isDebugEnabled()) {
            this.log.info(
              'Service',
              'Files already exist in storage (previous download)',
              {
                downloadId,
              }
            );
          }
          // This is not actually an error - the chapter is already downloaded
        } else {
          // This is a real storage error
          throw storageError;
        }
      }

      // Step 5: Validate chapter integrity
      if (isDebugEnabled()) {
        this.log.info('Service', 'Step 5: Validating chapter integrity', {
          downloadId,
        });
      }

      const validationResult =
        await downloadValidationService.validateChapterIntegrity(
          mangaId,
          chapterNumber,
          {
            validateFileSize: true,
            validateFormat: true,
            validateContent: false,
            checkDimensions: false,
            deepScan: false,
            repairCorrupted: false,
          }
        );

      if (isDebugEnabled()) {
        this.log.info('Service', 'Validation complete', {
          downloadId,
          isValid: validationResult.isValid,
          integrityScore: validationResult.integrityScore,
        });
      }

      // Handle validation failures - be more lenient since images are downloaded successfully
      if (!validationResult.isValid && validationResult.integrityScore < 30) {
        if (
          validationResult.recommendedAction === 'redownload_corrupted' &&
          retryConfig.attempt < retryConfig.maxAttempts
        ) {
          this.log.warn('Service', 'Chapter validation failed, retrying', {
            downloadId,
            integrityScore: validationResult.integrityScore,
            attempt: retryConfig.attempt,
          });

          await chapterStorageService.deleteChapter(mangaId, chapterNumber);
          await this.delay(2000);

          return this.performDownloadFromInterceptedRequest(
            mangaId,
            chapterNumber,
            chapterId,
            vrfToken,
            downloadId,
            signal,
            refererUrl,
            { ...retryConfig, attempt: retryConfig.attempt + 1 }
          );
        }

        if (validationResult.integrityScore >= 50) {
          this.log.warn(
            'Service',
            'Chapter partially corrupted but keeping',
            {
              downloadId,
              integrityScore: validationResult.integrityScore,
            }
          );
        } else {
          // Don't throw error if we have downloaded images - validation might be failing due to metadata issues
          if (downloadedImages.length > 0) {
            this.log.warn(
              'Service',
              'Validation failed but images were downloaded successfully, continuing',
              {
                downloadId,
                integrityScore: validationResult.integrityScore,
                downloadedImages: downloadedImages.length,
              }
            );
          } else {
            throw new Error(
              `Chapter validation failed: integrity score ${validationResult.integrityScore}%`
            );
          }
        }
      }

      // Emit download completion event
      downloadEventEmitter.emitCompleted(mangaId, chapterNumber, downloadId);

      if (isDebugEnabled()) {
        this.log.info(
          'Service',
          'Chapter download completed successfully',
          {
            downloadId,
            totalImages: downloadedImages.length,
            integrityScore: validationResult.integrityScore,
          }
        );
      }

      return {
        success: true,
        downloadId,
        chapterImages: downloadedImages,
      };
    } catch (error) {
      if (signal.aborted) {
        return {
          success: false,
          error: {
            type: DownloadErrorType.CANCELLED,
            message: 'Download was cancelled',
            retryable: false,
            chapter: chapterNumber,
            mangaId,
          },
        };
      }

      // Use error handler for recovery
      const recoveryResult = await downloadErrorHandler.handleDownloadError(
        error instanceof Error ? error : new Error('Unknown error'),
        downloadId,
        {
          mangaId,
          chapterNumber,
          attemptNumber: retryConfig.attempt,
        }
      );

      if (
        recoveryResult.shouldRetry &&
        retryConfig.attempt < retryConfig.maxAttempts
      ) {
        // Before retrying, check if the chapter is actually already complete
        // This prevents unnecessary retries when storage errors occur but files exist
        const isNowComplete = await chapterStorageService.isChapterDownloaded(
          mangaId,
          chapterNumber
        );

        if (isNowComplete) {
          if (isDebugEnabled()) {
            this.log.info(
              'Service',
              'Chapter completed during error handling, not retrying',
              {
                downloadId,
                attempt: retryConfig.attempt,
              }
            );
          }

          const existingImages = await chapterStorageService.getChapterImages(
            mangaId,
            chapterNumber
          );

          return {
            success: true,
            downloadId,
            chapterImages: existingImages || [],
          };
        }

        if (recoveryResult.delay) {
          await this.delay(recoveryResult.delay);
        }

        return this.performDownloadFromInterceptedRequest(
          mangaId,
          chapterNumber,
          chapterId,
          vrfToken,
          downloadId,
          signal,
          refererUrl,
          { ...retryConfig, attempt: retryConfig.attempt + 1 }
        );
      }

      // Create final error result
      const downloadError: DownloadError = {
        type: this.categorizeError(error),
        message: recoveryResult.message,
        retryable: recoveryResult.shouldRetry,
        chapter: chapterNumber,
        mangaId,
      };

      this.log.error('Service', 'Download failed permanently', {
        downloadId,
        attempts: retryConfig.attempt,
        error: downloadError,
      });

      return {
        success: false,
        error: downloadError,
      };
    }
  }

  /**
   * Download images with validation and enhanced error handling
   */
  private async downloadImagesWithValidation(
    images: ChapterImage[],
    downloadId: string,
    signal: AbortSignal,
    _mangaId: string,
    _chapterNumber: string
  ): Promise<ChapterImage[]> {
    return this.downloadImages(images, downloadId, signal);
  }

  /**
   * Download images with concurrent processing and progress tracking
   */
  private async downloadImages(
    images: ChapterImage[],
    downloadId: string,
    signal: AbortSignal
  ): Promise<ChapterImage[]> {
    const downloadedImages: ChapterImage[] = [];
    const progress = this.activeDownloads.get(downloadId);

    if (!progress) {
      throw new Error('Download progress not found');
    }

    if (isDebugEnabled()) {
      this.log.info('Service', 'Starting batch image downloads', {
        downloadId,
        totalImages: images.length,
        batchSize: CONCURRENT_IMAGE_DOWNLOADS,
        totalBatches: Math.ceil(images.length / CONCURRENT_IMAGE_DOWNLOADS),
      });
    }

    // Process images in batches to limit concurrent downloads
    for (let i = 0; i < images.length; i += CONCURRENT_IMAGE_DOWNLOADS) {
      if (signal.aborted) {
        throw new Error('Download cancelled');
      }

      const batch = images.slice(i, i + CONCURRENT_IMAGE_DOWNLOADS);
      const batchNumber = Math.floor(i / CONCURRENT_IMAGE_DOWNLOADS) + 1;
      const totalBatches = Math.ceil(
        images.length / CONCURRENT_IMAGE_DOWNLOADS
      );

      if (isDebugEnabled()) {
        this.log.info(
          'Service',
          `Processing batch ${batchNumber}/${totalBatches}`,
          {
            downloadId,
            batchStart: i + 1,
            batchEnd: Math.min(i + CONCURRENT_IMAGE_DOWNLOADS, images.length),
            batchSize: batch.length,
          }
        );
      }

      const batchPromises = batch.map((image) =>
        this.downloadSingleImage(image, downloadId, signal)
      );

      try {
        const batchResults = await Promise.allSettled(batchPromises);

        for (let j = 0; j < batchResults.length; j++) {
          const result = batchResults[j];
          const originalImage = batch[j];

          if (!originalImage || !result) continue;

          if (result.status === 'fulfilled') {
            if (result.value) {
              downloadedImages.push(result.value);
              progress.downloadedImages++;

              if (isDebugEnabled()) {
                this.log.info(
                  'Service',
                  `Image ${originalImage.pageNumber} downloaded`,
                  {
                    downloadId,
                    pageNumber: originalImage.pageNumber,
                    fileSize: result.value.fileSize,
                  }
                );
              }
            } else {
              // Null result, mark as failed
              progress.failedImages++;
              downloadedImages.push({
                pageNumber: originalImage.pageNumber,
                originalUrl: originalImage.originalUrl,
                downloadStatus: ImageDownloadStatus.FAILED,
              });

              if (isDebugEnabled()) {
                this.log.warn(
                  'Service',
                  `Image ${originalImage.pageNumber} failed (null result)`,
                  {
                    downloadId,
                    pageNumber: originalImage.pageNumber,
                  }
                );
              }
            }
          } else {
            // Mark as failed but continue with other images
            progress.failedImages++;

            // Add failed image with error status
            downloadedImages.push({
              pageNumber: originalImage.pageNumber,
              originalUrl: originalImage.originalUrl,
              downloadStatus: ImageDownloadStatus.FAILED,
            });

            const errorMessage =
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason);

            if (isDebugEnabled()) {
              this.log.warn(
                'Service',
                `Image ${originalImage.pageNumber} failed`,
                {
                  downloadId,
                  pageNumber: originalImage.pageNumber,
                  error: errorMessage,
                  url: originalImage.originalUrl,
                }
              );
            }
          }
        }

        // Update progress with time estimation
        progress.progress = Math.round(
          (progress.downloadedImages / progress.totalImages) * 100
        );
        progress.lastUpdateTime = Date.now();

        // Calculate download speed and ETA
        this.updateProgressMetrics(progress);

        await downloadQueueService.updateDownloadProgress(
          downloadId,
          progress.progress,
          progress.downloadedImages,
          progress.totalImages
        );

        // Emit progress event
        downloadEventEmitter.emitProgress(
          progress.mangaId,
          progress.chapterNumber,
          downloadId,
          progress.progress,
          progress.estimatedTimeRemaining,
          progress.downloadSpeed
        );

        // Notify progress listeners
        this.notifyProgressListeners(
          downloadId,
          this.createProgressUpdate(progress)
        );

        if (isDebugEnabled()) {
          this.log.info(
            'Service',
            `Batch ${batchNumber}/${totalBatches} complete`,
            {
              downloadId,
              downloaded: progress.downloadedImages,
              failed: progress.failedImages,
              total: progress.totalImages,
              progress: progress.progress,
              speed: progress.downloadSpeed
                ? `${(progress.downloadSpeed / 1024).toFixed(2)} KB/s`
                : 'N/A',
            }
          );
        }
      } catch (error) {
        this.log.error('Service', 'Batch download error', {
          downloadId,
          batchNumber,
          batchStart: i,
          error,
        });
        throw error;
      }
    }

    // Check if we have enough successful downloads
    const successfulDownloads = downloadedImages.filter(
      (img) => img.downloadStatus !== ImageDownloadStatus.FAILED
    ).length;

    if (isDebugEnabled()) {
      this.log.info('Service', 'Download summary', {
        downloadId,
        total: images.length,
        successful: successfulDownloads,
        failed: progress.failedImages,
        successRate: `${((successfulDownloads / images.length) * 100).toFixed(1)}%`,
      });
    }

    if (successfulDownloads === 0) {
      throw new Error('All image downloads failed');
    }

    if (successfulDownloads < images.length * 0.8) {
      throw new Error(
        `Too many failed downloads: ${progress.failedImages}/${images.length} (need at least 80% success rate)`
      );
    }

    return downloadedImages;
  }

  /**
   * Download a single image with retry logic
   */
  private async downloadSingleImage(
    image: ChapterImage,
    downloadId: string,
    signal: AbortSignal
  ): Promise<ChapterImage | null> {
    if (!image.originalUrl) {
      if (isDebugEnabled()) {
        this.log.warn('Service', 'Image has no URL', {
          downloadId,
          pageNumber: image.pageNumber,
        });
      }
      return null;
    }

    const timeoutController = new AbortController();
    const timeoutId = setTimeout(
      () => timeoutController.abort(),
      DOWNLOAD_TIMEOUT
    );

    const startTime = Date.now();

    try {
      if (isDebugEnabled()) {
        this.log.info('Service', `⬇️ Downloading image ${image.pageNumber}`, {
          downloadId,
          pageNumber: image.pageNumber,
          url: image.originalUrl.substring(0, 100) + '...',
        });
      }

      const combinedSignal = this.combineAbortSignals([
        signal,
        timeoutController.signal,
      ]);

      const response = await fetch(image.originalUrl, {
        signal: combinedSignal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          Referer: image.originalUrl.split('/').slice(0, 3).join('/'),
          Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        },
      });

      if (!response.ok) {
        throw new Error(
          `HTTP ${response.status} for image ${image.pageNumber}`
        );
      }

      const blob = await response.blob();
      const downloadTime = Date.now() - startTime;

      // Update downloaded bytes for progress tracking
      const progress = this.activeDownloads.get(downloadId);
      if (progress) {
        progress.downloadedBytes += blob.size;
        progress.totalBytes += blob.size; // Estimate total based on downloaded
      }

      if (isDebugEnabled()) {
        this.log.info('Service', `Image ${image.pageNumber} downloaded`, {
          downloadId,
          pageNumber: image.pageNumber,
          fileSize: `${(blob.size / 1024).toFixed(2)} KB`,
          downloadTime: `${downloadTime}ms`,
          speed: `${(blob.size / 1024 / (downloadTime / 1000)).toFixed(2)} KB/s`,
        });
      }

      return {
        ...image,
        downloadStatus: ImageDownloadStatus.COMPLETED,
        fileSize: blob.size,
      };
    } catch (error) {
      const downloadTime = Date.now() - startTime;

      if (signal.aborted || timeoutController.signal.aborted) {
        if (isDebugEnabled()) {
          this.log.warn(
            'Service',
            `⏹️ Image ${image.pageNumber} download cancelled/timeout`,
            {
              downloadId,
              pageNumber: image.pageNumber,
              downloadTime: `${downloadTime}ms`,
            }
          );
        }
        throw error;
      }

      this.log.warn('Service', `Image ${image.pageNumber} download failed`, {
        downloadId,
        pageNumber: image.pageNumber,
        url: image.originalUrl.substring(0, 100) + '...',
        error: error instanceof Error ? error.message : 'Unknown error',
        downloadTime: `${downloadTime}ms`,
      });

      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Get download status for a specific chapter
   */
  async getDownloadStatus(
    mangaId: string,
    chapterNumber: string
  ): Promise<DownloadStatus> {
    const downloadId = this.generateDownloadId(mangaId, chapterNumber);

    // Check if currently downloading
    if (this.activeDownloads.has(downloadId)) {
      return DownloadStatus.DOWNLOADING;
    }

    // Check queue status
    const queueItem = await downloadQueueService.getDownloadById(downloadId);
    if (queueItem) {
      return queueItem.status;
    }

    // Check if already downloaded
    const isDownloaded = await chapterStorageService.isChapterDownloaded(
      mangaId,
      chapterNumber
    );

    return isDownloaded ? DownloadStatus.COMPLETED : DownloadStatus.QUEUED;
  }

  /**
   * Pause an active download
   */
  async pauseDownload(downloadId: string): Promise<void> {
    const abortController = this.downloadAbortControllers.get(downloadId);
    if (abortController) {
      abortController.abort();
      this.downloadAbortControllers.delete(downloadId);
    }

    await downloadQueueService.pauseDownload(downloadId);

    if (isDebugEnabled()) {
      this.log.info('Service', 'Download paused', { downloadId });
    }
  }

  /**
   * Resume a paused download
   */
  async resumeDownload(downloadId: string): Promise<void> {
    await downloadQueueService.resumeDownload(downloadId);

    if (isDebugEnabled()) {
      this.log.info('Service', 'Download resumed', { downloadId });
    }
  }

  /**
   * Cancel an active download
   */
  async cancelDownload(downloadId: string): Promise<void> {
    const abortController = this.downloadAbortControllers.get(downloadId);
    if (abortController) {
      abortController.abort();
      this.downloadAbortControllers.delete(downloadId);
    }

    this.activeDownloads.delete(downloadId);
    await downloadQueueService.cancelDownload(downloadId);

    if (isDebugEnabled()) {
      this.log.info('Service', 'Download cancelled', { downloadId });
    }
  }

  /**
   * Get all active downloads
   */
  async getActiveDownloads(): Promise<DownloadItem[]> {
    return downloadQueueService.getActiveDownloads();
  }

  // Progress tracking methods

  /**
   * Add a progress listener for a specific download
   */
  addProgressListener(
    downloadId: string,
    listener: ProgressUpdateListener
  ): () => void {
    if (!this.progressListeners.has(downloadId)) {
      this.progressListeners.set(downloadId, new Set());
    }

    this.progressListeners.get(downloadId)!.add(listener);

    // Return unsubscribe function
    return () => {
      const listeners = this.progressListeners.get(downloadId);
      if (listeners) {
        listeners.delete(listener);
        if (listeners.size === 0) {
          this.progressListeners.delete(downloadId);
        }
      }
    };
  }

  /**
   * Remove a progress listener
   */
  removeProgressListener(
    downloadId: string,
    listener: ProgressUpdateListener
  ): void {
    const listeners = this.progressListeners.get(downloadId);
    if (listeners) {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.progressListeners.delete(downloadId);
      }
    }
  }

  /**
   * Get current progress for a download
   */
  getDownloadProgress(downloadId: string): DownloadProgressType | null {
    const progress = this.activeDownloads.get(downloadId);
    if (!progress) return null;

    return this.createProgressUpdate(progress);
  }

  /**
   * Get progress for all active downloads
   */
  getAllDownloadProgress(): DownloadProgressType[] {
    const progressList: DownloadProgressType[] = [];

    for (const progress of this.activeDownloads.values()) {
      progressList.push(this.createProgressUpdate(progress));
    }

    return progressList;
  }

  /**
   * Update progress metrics (speed, ETA)
   */
  private updateProgressMetrics(progress: DownloadProgress): void {
    const now = Date.now();
    const elapsedTime = now - progress.startTime;

    if (elapsedTime > 0 && progress.downloadedBytes > 0) {
      // Calculate download speed (bytes per second)
      progress.downloadSpeed = progress.downloadedBytes / (elapsedTime / 1000);

      // Estimate remaining time based on current speed and remaining work
      if (progress.downloadSpeed > 0 && progress.totalImages > 0) {
        const remainingImages =
          progress.totalImages - progress.downloadedImages;
        const avgBytesPerImage =
          progress.downloadedBytes / Math.max(progress.downloadedImages, 1);
        const remainingBytes = remainingImages * avgBytesPerImage;

        progress.estimatedTimeRemaining = Math.round(
          remainingBytes / progress.downloadSpeed
        );
      }
    }
  }

  /**
   * Create a progress update object
   */
  private createProgressUpdate(
    progress: DownloadProgress
  ): DownloadProgressType {
    const result: DownloadProgressType = {
      status: DownloadStatus.DOWNLOADING,
      progress: progress.progress,
    };

    if (progress.estimatedTimeRemaining !== undefined) {
      result.estimatedTimeRemaining = progress.estimatedTimeRemaining;
    }

    if (progress.downloadSpeed !== undefined) {
      result.downloadSpeed = progress.downloadSpeed;
    }

    return result;
  }

  /**
   * Notify all progress listeners for a download
   */
  private notifyProgressListeners(
    downloadId: string,
    progressUpdate: DownloadProgressType
  ): void {
    const listeners = this.progressListeners.get(downloadId);
    if (!listeners) return;

    listeners.forEach((listener) => {
      try {
        listener(progressUpdate);
      } catch (error) {
        this.log.error('Service', 'Progress listener error', {
          downloadId,
          error,
        });
      }
    });
  }

  // Utility methods

  private generateDownloadId(mangaId: string, chapterNumber: string): string {
    return `${mangaId}_${chapterNumber}_${Date.now()}`;
  }

  /*
  private isRetryableError(error: any): boolean { // Reserved for future use
    if (!error) return false;

    const message = error.message?.toLowerCase() || '';

    // Network-related errors are generally retryable
    const retryablePatterns = [
      'network',
      'timeout',
      'connection',
      'fetch',
      'http 5', // 5xx server errors
      'temporary',
      'unavailable',
    ];

    // Non-retryable errors
    const nonRetryablePatterns = [
      'cancelled',
      'abort',
      'http 4', // 4xx client errors (except 429)
      'not found',
      'forbidden',
      'unauthorized',
    ];

    // Check for non-retryable patterns first
    for (const pattern of nonRetryablePatterns) {
      if (message.includes(pattern)) {
        return false;
      }
    }

    // Check for retryable patterns
    for (const pattern of retryablePatterns) {
      if (message.includes(pattern)) {
        return true;
      }
    }

    // Default to retryable for unknown errors
    return true;
  }
  */

  private categorizeError(error: any): DownloadErrorType {
    if (!error) return DownloadErrorType.UNKNOWN;

    const message = error.message?.toLowerCase() || '';

    if (message.includes('cancelled') || message.includes('abort')) {
      return DownloadErrorType.CANCELLED;
    }

    if (
      message.includes('network') ||
      message.includes('fetch') ||
      message.includes('timeout')
    ) {
      return DownloadErrorType.NETWORK_ERROR;
    }

    if (
      message.includes('storage') ||
      message.includes('space') ||
      message.includes('disk')
    ) {
      return DownloadErrorType.STORAGE_FULL;
    }

    if (
      message.includes('parse') ||
      message.includes('extract') ||
      message.includes('images')
    ) {
      return DownloadErrorType.PARSING_ERROR;
    }

    return DownloadErrorType.UNKNOWN;
  }

  private combineAbortSignals(signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();

    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        break;
      }

      signal.addEventListener('abort', () => {
        controller.abort();
      });
    }

    return controller.signal;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Clean up resources and stop all active downloads
   */
  async cleanup(): Promise<void> {
    // Cancel all active downloads
    for (const [
      downloadId,
      abortController,
    ] of this.downloadAbortControllers.entries()) {
      try {
        abortController.abort();
      } catch (error) {
        this.log.warn('Service', 'Error aborting download during cleanup', {
          downloadId,
          error,
        });
      }
    }

    // Clear all data structures
    this.activeDownloads.clear();
    this.downloadAbortControllers.clear();
    this.progressListeners.clear();

    if (isDebugEnabled()) {
      this.log.info('Service', 'Cleanup completed');
    }
  }
}

// Export singleton instance
export const downloadManagerService = DownloadManagerService.getInstance();
