// Download-related types for manga downloading feature

export enum DownloadStatus {
  QUEUED = 'queued',
  DOWNLOADING = 'downloading',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PAUSED = 'paused',
  CANCELLED = 'cancelled',
}

export enum DownloadErrorType {
  NETWORK_ERROR = 'network_error',
  STORAGE_FULL = 'storage_full',
  PARSING_ERROR = 'parsing_error',
  CANCELLED = 'cancelled',
  UNKNOWN = 'unknown',
}

export enum ImageDownloadStatus {
  PENDING = 'pending',
  DOWNLOADING = 'downloading',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface ChapterImage {
  pageNumber: number;
  originalUrl: string;
  localPath?: string;
  downloadStatus: ImageDownloadStatus;
  fileSize?: number;
}

export interface DownloadItem {
  id: string;
  mangaId: string;
  mangaTitle: string;
  chapterNumber: string;
  chapterUrl: string;
  status: DownloadStatus;
  progress: number;
  totalImages: number;
  downloadedImages: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface DownloadProgress {
  status: DownloadStatus;
  progress: number;
  estimatedTimeRemaining?: number;
  downloadSpeed?: number;
}

export interface DownloadError {
  type: DownloadErrorType;
  message: string;
  retryable: boolean;
  chapter: string;
  mangaId: string;
}

export interface StorageStats {
  totalSize: number;
  totalChapters: number;
  mangaCount: number;
  availableSpace: number;
  oldestDownload: number;
}

export interface DownloadQueueItem {
  id: string;
  mangaId: string;
  mangaTitle: string;
  chapterNumber: string;
  chapterUrl: string;
  priority: number;
  addedAt: number;
}

export interface QueueStatus {
  totalItems: number;
  activeDownloads: number;
  queuedItems: number;
  isPaused: boolean;
  isProcessing: boolean;
}

export interface ChapterContent {
  isOffline: boolean;
  html: string;
  images: ChapterImage[];
  missingImages: number[];
}

export interface DownloadResult {
  success: boolean;
  downloadId?: string;
  error?: DownloadError;
  chapterImages?: ChapterImage[];
}

export interface DownloadSettings {
  maxConcurrentDownloads: number;
  maxStorageSize: number;
  autoDownloadBookmarked: boolean;
  downloadQuality: 'original' | 'compressed';
  enableBackgroundDownloads: boolean;
  storageWarningThreshold: number;
  autoCleanupEnabled: boolean;
  autoCleanupDays: number;
}

export interface ChapterMetadata {
  mangaId: string;
  chapterNumber: string;
  downloadedAt: number;
  totalImages: number;
  totalSize: number;
  version: string;
  integrityScore?: number;
  lastValidated?: number;
  validationErrors?: string[];
}
