// Contains all settings-related types

export interface AppSettings {
  theme: ThemeType;
  enableDebugTab: boolean;
  onboardingCompleted: boolean;
  accentColor?: string;
}

export type ThemeType = 'light' | 'dark' | 'system';
