// Atom state type definitions for Zedux state management
import { ColorScheme } from '@/constants/Colors';
import { ThemeType, DownloadSettings } from './settings';
import { MangaData, MangaDetails } from './manga';
import { DownloadQueueItem, DownloadErrorType } from './download';

// Theme Atom State
export interface ThemeAtomState {
  theme: ThemeType;
  accentColor: string | undefined;
  systemTheme: ColorScheme;
  actualTheme: 'light' | 'dark';
}

// Network Atom State
export interface NetworkAtomState {
  isOffline: boolean;
  isConnected: boolean;
  networkType: string;
  isInternetReachable: boolean | null;
  showOfflineIndicator: boolean;
}

// Toast Atom State
export interface ToastConfig {
  message: string;
  icon?: string;
  duration?: number;
  type?: 'success' | 'info' | 'warning' | 'error';
}

export interface ToastAtomState {
  config: ToastConfig | null;
  isVisible: boolean;
}

// Bookmark List Atom State
export interface BookmarkListAtomState {
  bookmarks: MangaData[];
  bookmarkKeys: string[];
  lastUpdated: number;
}

// Settings Atom State
export interface SettingsAtomState {
  theme: ThemeType;
  enableDebugTab: boolean;
  onboardingCompleted: boolean;
  accentColor?: string | undefined;
  defaultLayout?: 'grid' | 'list';
  downloadSettings: DownloadSettings;
}

// Download Manager Atom State
export interface DownloadContext {
  downloadId: string;
  mangaId: string;
  mangaTitle: string;
  chapterNumber: string;
  chapterUrl: string;
  startTime: number;
}

export interface PausedDownloadInfo {
  context: DownloadContext;
  progress: DownloadProgressInfo;
  pausedAt: number;
  pauseReason: 'manual' | 'error' | 'app_state';
}

export interface DownloadProgressInfo {
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
  downloadSpeed?: number;
  totalBytes: number;
  downloadedBytes: number;
  error?: {
    type: DownloadErrorType;
    message: string;
  };
}

export interface DownloadManagerAtomState {
  activeDownloads: Map<string, DownloadProgressInfo>;
  pausedDownloads: Map<string, PausedDownloadInfo>;
  downloadContexts: Map<string, DownloadContext>;
}

// Download Queue Atom State
export interface DownloadQueueAtomState {
  queue: DownloadQueueItem[];
  activeDownloadIds: Set<string>;
  isPaused: boolean;
  isProcessing: boolean;
}

// Offline Cache Atom State
export interface CachedMangaDetails {
  data: MangaDetails;
  timestamp: number;
  expiresAt: number;
}

export interface CachedSearchResults {
  data: any;
  timestamp: number;
  expiresAt: number;
}

export interface CachedHomeData {
  data: any;
  timestamp: number;
  expiresAt: number;
}

export interface OfflineCacheAtomState {
  mangaDetailsCache: Map<string, CachedMangaDetails>;
  searchCache: Map<string, CachedSearchResults>;
  homeCache: CachedHomeData | null;
}
