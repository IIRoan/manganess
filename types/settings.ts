// Contains all settings-related types
import { DownloadSettings, StorageStats } from './download';

export interface AppSettings {
  theme: ThemeType;
  enableDebugTab: boolean;
  onboardingCompleted: boolean;
  accentColor?: string | undefined;
  /** @deprecated Prefer readerProfiles.manga — kept for migration */
  readingMode?: ReadingMode;
  /** @deprecated Prefer readerProfiles */
  readerBackground?: ReaderBackground;
  /** @deprecated Prefer progressBarPosition / readerProfiles */
  showPageIndicator?: boolean;
  /** @deprecated Prefer readerProfiles */
  readerImageFit?: ReaderImageFit;
  /** @deprecated Prefer readerProfiles */
  progressBarPosition?: ProgressBarPosition;
  /** @deprecated Prefer readerProfiles */
  readerDimPercent?: number;
  /** @deprecated Prefer readerProfiles */
  keepHeaderVisible?: boolean;
  /** Reader preferences keyed by content format (manga vs manhwa). */
  readerProfiles?: ReaderProfiles;
  /**
   * When false, hides the settings gear in the chapter reader.
   * Only configurable from the Settings screen (not the in-reader drawer).
   * @default true
   */
  showReaderSettingsButton?: boolean;
  downloadSettings?: DownloadSettings;
}

export type ThemeType = 'light' | 'dark' | 'system';

/**
 * Reading mode for the chapter reader.
 * - `auto`: detect from title type / image aspect (manhwa=vertical, manga=horizontal LTR).
 *   Explicit manga titles use LTR immediately; aspect detection is only for unknown types.
 * - `vertical`: force vertical long-strip (webtoon) scrolling
 * - `ltr`: force horizontal page-by-page, left-to-right (manga only; ignored for manhwa)
 * - `rtl`: force horizontal page-by-page, right-to-left (manga only; ignored for manhwa)
 *
 * Manhwa / manhua / webtoon titles always use vertical scroll regardless of this setting.
 */
export type ReadingMode = 'auto' | 'vertical' | 'ltr' | 'rtl';

/** Page backdrop behind manga images in the chapter reader. */
export type ReaderBackground = 'default' | 'black' | 'white' | 'gray';

/** How chapter pages are scaled in the reader. */
export type ReaderImageFit = 'width' | 'height' | 'both' | 'fill';

/** Where the reading progress bar appears. */
export type ProgressBarPosition = 'top' | 'bottom' | 'none';

/** Content format used to store separate reader preferences. */
export type ReaderContentProfile = 'manga' | 'manhwa';

/** Per-format reader preferences (manga page mode vs manhwa strip). */
export interface ReaderProfileSettings {
  readingMode: ReadingMode;
  readerBackground: ReaderBackground;
  readerImageFit: ReaderImageFit;
  progressBarPosition: ProgressBarPosition;
  readerDimPercent: number;
  keepHeaderVisible: boolean;
}

export interface ReaderProfiles {
  manga: ReaderProfileSettings;
  manhwa: ReaderProfileSettings;
}

// Re-export for convenience
export type { DownloadSettings, StorageStats };
