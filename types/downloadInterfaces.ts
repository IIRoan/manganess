// Core interfaces for download services

import { WebView } from 'react-native-webview';
import {
  ChapterImage,
  DownloadItem,
  DownloadResult,
  DownloadStatus,
  DownloadQueueItem,
  QueueStatus,
  ChapterContent,
  StorageStats,
} from './download';

export interface DownloadManager {
  downloadChapter(
    mangaId: string,
    chapterNumber: string,
    chapterUrl: string
  ): Promise<DownloadResult>;
  getDownloadStatus(
    mangaId: string,
    chapterNumber: string
  ): Promise<DownloadStatus>;
  pauseDownload(downloadId: string): Promise<void>;
  resumeDownload(downloadId: string): Promise<void>;
  cancelDownload(downloadId: string): Promise<void>;
  getActiveDownloads(): Promise<DownloadItem[]>;
  isDownloadPaused(downloadId: string): boolean;
  restorePausedDownloadsAutomatically(): Promise<void>;
}

export interface ImageExtractor {
  extractImagesFromHtml(
    html: string,
    chapterUrl?: string
  ): Promise<ChapterImage[]>;
  extractImagesFromWebView(webView: WebView): Promise<ChapterImage[]>;
  waitForImagesLoaded(webView: WebView): Promise<ChapterImage[]>;
}

export interface ChapterStorageService {
  saveChapterImages(
    mangaId: string,
    chapterNumber: string,
    images: ChapterImage[]
  ): Promise<void>;
  getChapterImages(
    mangaId: string,
    chapterNumber: string
  ): Promise<ChapterImage[] | null>;
  deleteChapter(mangaId: string, chapterNumber: string): Promise<void>;
  getStorageStats(): Promise<StorageStats>;
  cleanupOldDownloads(): Promise<void>;
  isChapterDownloaded(mangaId: string, chapterNumber: string): Promise<boolean>;
  getDownloadedChapters(mangaId: string): Promise<string[]>;
}

export interface OfflineReader {
  getChapterContent(
    mangaId: string,
    chapterNumber: string
  ): Promise<ChapterContent>;
  isChapterAvailableOffline(
    mangaId: string,
    chapterNumber: string
  ): Promise<boolean>;
  generateOfflineHtml(images: ChapterImage[]): string;
}

export interface DownloadValidationService {
  validateChapterIntegrity(
    mangaId: string,
    chapterNumber: string,
    options?: {
      validateFileSize?: boolean;
      validateFormat?: boolean;
      validateContent?: boolean;
      checkDimensions?: boolean;
      deepScan?: boolean;
      repairCorrupted?: boolean;
    }
  ): Promise<{
    isValid: boolean;
    integrityScore: number;
    errors: string[];
    warnings: string[];
    recommendedAction: string;
  }>;
  validateForOfflineReading(
    mangaId: string,
    chapterNumber: string
  ): Promise<{
    canRead: boolean;
    missingImages: number[];
    corruptedImages: number[];
    warnings: string[];
  }>;
  repairCorruptedChapter(
    mangaId: string,
    chapterNumber: string,
    validationResult: any
  ): Promise<{
    success: boolean;
    repairedImages: number;
    errors: string[];
  }>;
}

export interface DownloadErrorHandler {
  handleDownloadError(
    error: Error,
    downloadId: string,
    context?: any
  ): Promise<{
    strategy: string;
    shouldRetry: boolean;
    delay?: number;
    message: string;
    requiresUserAction: boolean;
    suggestedActions?: string[];
  }>;
  handleNetworkError(
    error: Error,
    downloadId: string,
    networkContext: any,
    attemptNumber?: number
  ): Promise<any>;
  handleStorageError(
    error: Error,
    downloadId: string,
    storageContext: any,
    context?: any
  ): Promise<any>;
}

export interface DownloadQueue {
  addToQueue(item: DownloadQueueItem): Promise<void>;
  processQueue(): Promise<void>;
  pauseQueue(): Promise<void>;
  resumeQueue(): Promise<void>;
  getQueueStatus(): Promise<QueueStatus>;
}
