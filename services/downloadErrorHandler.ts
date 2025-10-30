import {
  DownloadError,
  DownloadErrorType,
  DownloadStatus,
  DownloadItem,
} from '@/types/download';
import { chapterStorageService } from './chapterStorageService';
import { downloadNotificationService } from './downloadNotificationService';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';

// Error recovery configuration
const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAY_BASE = 1000; // Base delay in milliseconds
const RETRY_DELAY_MULTIPLIER = 2; // Exponential backoff multiplier
// const NETWORK_TIMEOUT = 30000; // 30 seconds - Reserved for future use
// const MIN_FREE_SPACE_REQUIRED = 50 * 1024 * 1024; // 50MB minimum - Reserved for future use

// Error recovery strategies
export enum RecoveryStrategy {
  RETRY = 'retry',
  SKIP = 'skip',
  ABORT = 'abort',
  CLEANUP_AND_RETRY = 'cleanup_and_retry',
  USER_INTERVENTION = 'user_intervention',
}

export interface ErrorRecoveryResult {
  strategy: RecoveryStrategy;
  shouldRetry: boolean;
  delay?: number;
  message: string;
  requiresUserAction: boolean;
  suggestedActions?: string[];
}

export interface NetworkErrorContext {
  url: string;
  statusCode?: number;
  responseText?: string;
  timeout: boolean;
  connectionError: boolean;
}

export interface StorageErrorContext {
  availableSpace: number;
  requiredSpace: number;
  totalUsage: number;
  maxStorage: number;
  canCleanup: boolean;
}

export interface ValidationErrorContext {
  expectedSize?: number;
  actualSize?: number;
  expectedChecksum?: string;
  actualChecksum?: string;
  corruptionType: 'size_mismatch' | 'checksum_mismatch' | 'invalid_format';
}

class DownloadErrorHandler {
  private static instance: DownloadErrorHandler;
  private log = logger();
  private retryAttempts: Map<string, number> = new Map();
  private errorHistory: Map<string, DownloadError[]> = new Map();

  private constructor() {}

  static getInstance(): DownloadErrorHandler {
    if (!DownloadErrorHandler.instance) {
      DownloadErrorHandler.instance = new DownloadErrorHandler();
    }
    return DownloadErrorHandler.instance;
  }

  /**
   * Handle download errors with comprehensive recovery strategies
   */
  async handleDownloadError(
    error: Error | DownloadError,
    downloadId: string,
    context?: {
      mangaId: string;
      chapterNumber: string;
      attemptNumber: number;
      networkContext?: NetworkErrorContext;
      storageContext?: StorageErrorContext;
      validationContext?: ValidationErrorContext;
    }
  ): Promise<ErrorRecoveryResult> {
    try {
      // Convert Error to DownloadError if needed
      const downloadError = this.normalizeError(error, context);

      // Track error in history
      this.trackError(downloadId, downloadError);

      if (isDebugEnabled()) {
        this.log.error('Service', 'Handling download error', {
          downloadId,
          errorType: downloadError.type,
          message: downloadError.message,
          attemptNumber: context?.attemptNumber || 1,
        });
      }

      // Determine recovery strategy based on error type and context
      const recoveryResult = await this.determineRecoveryStrategy(
        downloadError,
        downloadId,
        context
      );

      // Execute recovery actions if needed
      if (recoveryResult.strategy !== RecoveryStrategy.ABORT) {
        await this.executeRecoveryActions(recoveryResult, downloadId, context);
      }

      // Send user notification for critical errors
      if (recoveryResult.requiresUserAction) {
        await this.notifyUserOfError(downloadError, recoveryResult, context);
      }

      return recoveryResult;
    } catch (handlerError) {
      this.log.error('Service', 'Error in error handler', {
        downloadId,
        originalError: error,
        handlerError,
      });

      // Fallback recovery result
      return {
        strategy: RecoveryStrategy.ABORT,
        shouldRetry: false,
        message: 'Critical error in error handling system',
        requiresUserAction: true,
        suggestedActions: [
          'Restart the app',
          'Check device storage',
          'Contact support',
        ],
      };
    }
  }

  /**
   * Handle network-specific errors with intelligent recovery
   */
  async handleNetworkError(
    _error: Error,
    downloadId: string,
    networkContext: NetworkErrorContext,
    attemptNumber: number = 1
  ): Promise<ErrorRecoveryResult> {
    // Check network connectivity
    const isConnected = await this.checkNetworkConnectivity();
    if (!isConnected) {
      return {
        strategy: RecoveryStrategy.USER_INTERVENTION,
        shouldRetry: false,
        message: 'No internet connection available',
        requiresUserAction: true,
        suggestedActions: [
          'Check your internet connection',
          'Try again when connected',
          'Enable mobile data if using WiFi',
        ],
      };
    }

    // Handle specific network error types
    if (networkContext.statusCode) {
      return this.handleHttpError(
        networkContext.statusCode,
        downloadId,
        attemptNumber
      );
    }

    if (networkContext.timeout) {
      return this.handleTimeoutError(downloadId, attemptNumber);
    }

    if (networkContext.connectionError) {
      return this.handleConnectionError(downloadId, attemptNumber);
    }

    // Generic network error recovery
    const downloadError: DownloadError = {
      type: DownloadErrorType.NETWORK_ERROR,
      message: this.getNetworkErrorMessage(networkContext),
      retryable: this.isNetworkErrorRetryable(networkContext),
      chapter: '',
      mangaId: '',
    };

    return this.getRetryStrategy(downloadId, attemptNumber, downloadError);
  }

  /**
   * Handle storage-specific errors with space management
   */
  async handleStorageError(
    _error: Error,
    downloadId: string,
    storageContext: StorageErrorContext,
    _context?: { mangaId: string; chapterNumber: string }
  ): Promise<ErrorRecoveryResult> {
    if (isDebugEnabled()) {
      this.log.warn('Service', 'Handling storage error', {
        downloadId,
        availableSpace: storageContext.availableSpace,
        requiredSpace: storageContext.requiredSpace,
        canCleanup: storageContext.canCleanup,
      });
    }

    // Check if we can free up space through cleanup
    if (
      storageContext.canCleanup &&
      storageContext.availableSpace < storageContext.requiredSpace
    ) {
      try {
        const cleanupResult = await this.performIntelligentCleanup(
          storageContext.requiredSpace - storageContext.availableSpace
        );

        if (cleanupResult.success) {
          return {
            strategy: RecoveryStrategy.CLEANUP_AND_RETRY,
            shouldRetry: true,
            delay: 2000, // Wait 2 seconds after cleanup
            message: `Freed ${this.formatFileSize(cleanupResult.freedSpace)} of storage space`,
            requiresUserAction: false,
          };
        }
      } catch (cleanupError) {
        this.log.error('Service', 'Failed to perform cleanup', {
          downloadId,
          cleanupError,
        });
      }
    }

    // Check if storage is critically low
    const storageUsagePercent =
      (storageContext.totalUsage / storageContext.maxStorage) * 100;

    if (storageUsagePercent > 95) {
      return {
        strategy: RecoveryStrategy.USER_INTERVENTION,
        shouldRetry: false,
        message: 'Storage is critically full (>95%)',
        requiresUserAction: true,
        suggestedActions: [
          'Delete old downloads manually',
          'Increase storage limit in settings',
          'Free up device storage',
          'Move app to device with more storage',
        ],
      };
    }

    if (storageUsagePercent > 85) {
      return {
        strategy: RecoveryStrategy.USER_INTERVENTION,
        shouldRetry: false,
        message: 'Storage limit reached. Manual cleanup required.',
        requiresUserAction: true,
        suggestedActions: [
          'Review and delete old downloads',
          'Increase storage limit in settings',
          'Enable automatic cleanup',
        ],
      };
    }

    // Default storage error handling
    return {
      strategy: RecoveryStrategy.ABORT,
      shouldRetry: false,
      message: 'Insufficient storage space available',
      requiresUserAction: true,
      suggestedActions: [
        'Free up storage space',
        'Delete unused downloads',
        'Increase storage limit',
      ],
    };
  }

  /**
   * Normalize different error types into DownloadError
   */
  private normalizeError(
    error: Error | DownloadError,
    context?: any
  ): DownloadError {
    if ('type' in error && 'retryable' in error) {
      return error as DownloadError;
    }

    const message = error.message || 'Unknown error';
    const lowerMessage = message.toLowerCase();

    // Categorize error based on message content
    let type = DownloadErrorType.UNKNOWN;
    let retryable = true;

    if (
      lowerMessage.includes('network') ||
      lowerMessage.includes('fetch') ||
      lowerMessage.includes('timeout') ||
      lowerMessage.includes('connection')
    ) {
      type = DownloadErrorType.NETWORK_ERROR;
    } else if (
      lowerMessage.includes('storage') ||
      lowerMessage.includes('space') ||
      lowerMessage.includes('disk') ||
      lowerMessage.includes('quota')
    ) {
      type = DownloadErrorType.STORAGE_FULL;
      retryable = false; // Storage errors need intervention
    } else if (
      lowerMessage.includes('parse') ||
      lowerMessage.includes('extract') ||
      lowerMessage.includes('invalid') ||
      lowerMessage.includes('corrupt')
    ) {
      type = DownloadErrorType.PARSING_ERROR;
    } else if (
      lowerMessage.includes('cancel') ||
      lowerMessage.includes('abort')
    ) {
      type = DownloadErrorType.CANCELLED;
      retryable = false;
    }

    return {
      type,
      message,
      retryable,
      chapter: context?.chapterNumber || '',
      mangaId: context?.mangaId || '',
    };
  }

  /**
   * Determine the best recovery strategy for an error
   */
  private async determineRecoveryStrategy(
    error: DownloadError,
    downloadId: string,
    context?: any
  ): Promise<ErrorRecoveryResult> {
    const attemptNumber = context?.attemptNumber || 1;

    // Check if we've exceeded retry limits
    if (attemptNumber >= MAX_RETRY_ATTEMPTS) {
      return {
        strategy: RecoveryStrategy.ABORT,
        shouldRetry: false,
        message: `Maximum retry attempts (${MAX_RETRY_ATTEMPTS}) exceeded`,
        requiresUserAction: true,
        suggestedActions: [
          'Try again later',
          'Check your internet connection',
          'Verify the source is available',
        ],
      };
    }

    // Handle specific error types
    switch (error.type) {
      case DownloadErrorType.NETWORK_ERROR:
        if (context?.networkContext) {
          return this.handleNetworkError(
            new Error(error.message),
            downloadId,
            context.networkContext,
            attemptNumber
          );
        }
        return this.getRetryStrategy(downloadId, attemptNumber, error);

      case DownloadErrorType.STORAGE_FULL:
        if (context?.storageContext) {
          return this.handleStorageError(
            new Error(error.message),
            downloadId,
            context.storageContext,
            context
          );
        }
        return this.getStorageErrorStrategy();

      case DownloadErrorType.PARSING_ERROR:
        return this.getRetryStrategy(downloadId, attemptNumber, error);

      case DownloadErrorType.CANCELLED:
        return {
          strategy: RecoveryStrategy.ABORT,
          shouldRetry: false,
          message: 'Download was cancelled by user',
          requiresUserAction: false,
        };

      default:
        return this.getRetryStrategy(downloadId, attemptNumber, error);
    }
  }

  /**
   * Get retry strategy with exponential backoff
   */
  private getRetryStrategy(
    _downloadId: string,
    attemptNumber: number,
    error: DownloadError
  ): ErrorRecoveryResult {
    if (!error.retryable || attemptNumber >= MAX_RETRY_ATTEMPTS) {
      return {
        strategy: RecoveryStrategy.ABORT,
        shouldRetry: false,
        message: error.retryable
          ? 'Maximum retries exceeded'
          : 'Error is not retryable',
        requiresUserAction: true,
        suggestedActions: ['Try again later', 'Check the source availability'],
      };
    }

    const delay =
      RETRY_DELAY_BASE * Math.pow(RETRY_DELAY_MULTIPLIER, attemptNumber - 1);

    return {
      strategy: RecoveryStrategy.RETRY,
      shouldRetry: true,
      delay,
      message: `Retrying in ${Math.round(delay / 1000)} seconds (attempt ${attemptNumber}/${MAX_RETRY_ATTEMPTS})`,
      requiresUserAction: false,
    };
  }

  /**
   * Get storage error strategy
   */
  private getStorageErrorStrategy(): ErrorRecoveryResult {
    return {
      strategy: RecoveryStrategy.USER_INTERVENTION,
      shouldRetry: false,
      message: 'Storage space is insufficient',
      requiresUserAction: true,
      suggestedActions: [
        'Delete old downloads',
        'Increase storage limit in settings',
        'Free up device storage',
      ],
    };
  }

  /**
   * Handle HTTP status code errors
   */
  private handleHttpError(
    statusCode: number,
    downloadId: string,
    attemptNumber: number
  ): ErrorRecoveryResult {
    if (statusCode >= 500) {
      // Server errors - retry with backoff
      return this.getRetryStrategy(downloadId, attemptNumber, {
        type: DownloadErrorType.NETWORK_ERROR,
        message: `Server error: HTTP ${statusCode}`,
        retryable: true,
        chapter: '',
        mangaId: '',
      });
    }

    if (statusCode === 429) {
      // Rate limited - retry with longer delay
      return {
        strategy: RecoveryStrategy.RETRY,
        shouldRetry: true,
        delay: 30000, // 30 seconds for rate limiting
        message: 'Rate limited by server, waiting before retry',
        requiresUserAction: false,
      };
    }

    if (statusCode >= 400 && statusCode < 500) {
      // Client errors - usually not retryable
      return {
        strategy: RecoveryStrategy.ABORT,
        shouldRetry: false,
        message: `Client error: HTTP ${statusCode}`,
        requiresUserAction: true,
        suggestedActions: [
          'Check if the chapter is still available',
          'Try a different source if available',
          'Report the issue if it persists',
        ],
      };
    }

    // Unknown status code
    return this.getRetryStrategy(downloadId, attemptNumber, {
      type: DownloadErrorType.NETWORK_ERROR,
      message: `HTTP ${statusCode}`,
      retryable: true,
      chapter: '',
      mangaId: '',
    });
  }

  /**
   * Handle timeout errors
   */
  private handleTimeoutError(
    downloadId: string,
    attemptNumber: number
  ): ErrorRecoveryResult {
    return this.getRetryStrategy(downloadId, attemptNumber, {
      type: DownloadErrorType.NETWORK_ERROR,
      message: 'Request timed out',
      retryable: true,
      chapter: '',
      mangaId: '',
    });
  }

  /**
   * Handle connection errors
   */
  private handleConnectionError(
    downloadId: string,
    attemptNumber: number
  ): ErrorRecoveryResult {
    return this.getRetryStrategy(downloadId, attemptNumber, {
      type: DownloadErrorType.NETWORK_ERROR,
      message: 'Connection failed',
      retryable: true,
      chapter: '',
      mangaId: '',
    });
  }

  /**
   * Execute recovery actions based on strategy
   */
  private async executeRecoveryActions(
    result: ErrorRecoveryResult,
    downloadId: string,
    _context?: any
  ): Promise<void> {
    switch (result.strategy) {
      case RecoveryStrategy.CLEANUP_AND_RETRY:
        // Cleanup actions are already performed in strategy determination
        break;

      case RecoveryStrategy.RETRY:
        // Track retry attempt
        const currentAttempts = this.retryAttempts.get(downloadId) || 0;
        this.retryAttempts.set(downloadId, currentAttempts + 1);
        break;

      case RecoveryStrategy.ABORT:
        // Clean up retry tracking
        this.retryAttempts.delete(downloadId);
        this.errorHistory.delete(downloadId);
        break;

      case RecoveryStrategy.USER_INTERVENTION:
        // Log for user intervention tracking
        if (isDebugEnabled()) {
          this.log.info('Service', 'User intervention required', {
            downloadId,
            message: result.message,
            suggestedActions: result.suggestedActions,
          });
        }
        break;
    }
  }

  /**
   * Perform intelligent cleanup to free storage space
   */
  private async performIntelligentCleanup(
    requiredSpace: number
  ): Promise<{ success: boolean; freedSpace: number }> {
    try {
      // Use the existing cleanup functionality
      await chapterStorageService.cleanupOldDownloads();

      // Check if we freed enough space
      const stats = await chapterStorageService.getStorageStats();

      return {
        success: stats.availableSpace >= requiredSpace,
        freedSpace: Math.max(0, requiredSpace - stats.availableSpace),
      };
    } catch (error) {
      this.log.error('Service', 'Failed to perform intelligent cleanup', {
        error,
      });
      return { success: false, freedSpace: 0 };
    }
  }

  /**
   * Check network connectivity
   */
  private async checkNetworkConnectivity(): Promise<boolean> {
    try {
      // Simple connectivity check
      const response = await fetch('https://www.google.com/favicon.ico', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get network error message based on context
   */
  private getNetworkErrorMessage(context: NetworkErrorContext): string {
    if (context.timeout) {
      return 'Request timed out';
    }
    if (context.connectionError) {
      return 'Connection failed';
    }
    if (context.statusCode) {
      return `HTTP ${context.statusCode}${context.responseText ? ': ' + context.responseText : ''}`;
    }
    return 'Network error occurred';
  }

  /**
   * Check if network error is retryable
   */
  private isNetworkErrorRetryable(context: NetworkErrorContext): boolean {
    if (context.statusCode) {
      // 4xx client errors are generally not retryable (except 429)
      if (context.statusCode >= 400 && context.statusCode < 500) {
        return context.statusCode === 429; // Rate limiting is retryable
      }
      // 5xx server errors are retryable
      return context.statusCode >= 500;
    }
    // Timeouts and connection errors are retryable
    return context.timeout || context.connectionError;
  }

  /**
   * Track error in history for analysis
   */
  private trackError(downloadId: string, error: DownloadError): void {
    if (!this.errorHistory.has(downloadId)) {
      this.errorHistory.set(downloadId, []);
    }

    const history = this.errorHistory.get(downloadId)!;
    history.push({
      ...error,
      timestamp: Date.now(),
    } as DownloadError & { timestamp: number });

    // Keep only last 10 errors per download
    if (history.length > 10) {
      history.splice(0, history.length - 10);
    }
  }

  /**
   * Notify user of critical errors
   */
  private async notifyUserOfError(
    _error: DownloadError,
    recovery: ErrorRecoveryResult,
    context?: any
  ): Promise<void> {
    try {
      if (context?.mangaId && context?.chapterNumber) {
        const downloadItem: DownloadItem = {
          id: `error_${Date.now()}`,
          mangaId: context.mangaId,
          mangaTitle: context.mangaTitle || `Manga ${context.mangaId}`,
          chapterNumber: context.chapterNumber,
          chapterUrl: '',
          status: DownloadStatus.FAILED,
          progress: 0,
          totalImages: 0,
          downloadedImages: 0,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          error: recovery.message,
        };

        await downloadNotificationService.showDownloadFailed(
          downloadItem,
          recovery.message
        );
      }
    } catch (notificationError) {
      this.log.error('Service', 'Failed to send error notification', {
        notificationError,
      });
    }
  }

  /**
   * Format file size for display
   */
  private formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Get error statistics for a download
   */
  getErrorStats(downloadId: string): {
    totalErrors: number;
    retryAttempts: number;
    errorTypes: { [key: string]: number };
    lastError?: DownloadError | undefined;
  } {
    const history = this.errorHistory.get(downloadId) || [];
    const retryAttempts = this.retryAttempts.get(downloadId) || 0;

    const errorTypes: { [key: string]: number } = {};
    for (const error of history) {
      errorTypes[error.type] = (errorTypes[error.type] || 0) + 1;
    }

    return {
      totalErrors: history.length,
      retryAttempts,
      errorTypes,
      lastError: history.length > 0 ? history[history.length - 1] : undefined,
    };
  }

  /**
   * Clear error tracking for a download
   */
  clearErrorTracking(downloadId: string): void {
    this.retryAttempts.delete(downloadId);
    this.errorHistory.delete(downloadId);
  }

  /**
   * Get all downloads with errors
   */
  getDownloadsWithErrors(): string[] {
    return Array.from(this.errorHistory.keys());
  }

  /**
   * Cleanup error handler resources
   */
  cleanup(): void {
    this.retryAttempts.clear();
    this.errorHistory.clear();

    if (isDebugEnabled()) {
      this.log.info('Service', 'Download error handler cleaned up');
    }
  }
}

// Export singleton instance
export const downloadErrorHandler = DownloadErrorHandler.getInstance();
