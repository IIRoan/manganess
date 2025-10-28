// Contains all settings-related types
import { DownloadSettings, StorageStats } from './download';

export interface AppSettings {
  theme: ThemeType;
  enableDebugTab: boolean;
  onboardingCompleted: boolean;
  accentColor?: string;
  downloadSettings?: DownloadSettings;
}

export type ThemeType = 'light' | 'dark' | 'system';

// Re-export for convenience
export type { DownloadSettings, StorageStats };
