// Contains all settings-related types

export interface AppSettings {
  theme: ThemeType;
  enableDebugTab: boolean;
  onboardingCompleted: boolean;
}

export type ThemeType = 'light' | 'dark' | 'system';