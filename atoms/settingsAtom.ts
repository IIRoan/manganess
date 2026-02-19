import { atom, injectStore, injectEffect, api } from '@zedux/react';
import { SettingsAtomState } from '@/types/atoms';
import { asyncStoragePlugin } from '@/atoms/plugins/asyncStoragePlugin';
import { logger } from '@/utils/logger';

const DEFAULT_DOWNLOAD_SETTINGS = {
  maxConcurrentDownloads: 3,
  maxStorageSize: 2 * 1024 * 1024 * 1024, // 2GB
  autoDownloadBookmarked: false,
  downloadQuality: 'original' as const,
  enableBackgroundDownloads: true,
  storageWarningThreshold: 85, // 85%
  autoCleanupEnabled: false,
  autoCleanupDays: 30,
};

const DEFAULT_SETTINGS: SettingsAtomState = {
  theme: 'system',
  enableDebugTab: false,
  onboardingCompleted: false,
  defaultLayout: 'list',
  downloadSettings: DEFAULT_DOWNLOAD_SETTINGS,
};

/**
 * Settings Atom
 *
 * Manages all app-wide settings with AsyncStorage persistence and legacy migration.
 *
 * Key behaviors:
 * - Persists to AsyncStorage key `app_settings` with 300ms debounce
 * - Provides default values for any missing fields on load
 * - Migrates legacy `searchLayout` field to `defaultLayout` automatically
 * - `updateSettings` merges partial updates, deep-merging `downloadSettings`
 *
 * Dependencies: asyncStoragePlugin
 * Persistence: AsyncStorage key `app_settings`
 *
 * @see hooks/useSettings.ts for React hook access
 * @see atoms/themeAtom.ts which reads theme/accentColor from this atom
 * @see Requirements 6.1–6.5
 */
export const settingsAtom = atom('settings', () => {
  const store = injectStore<SettingsAtomState>(DEFAULT_SETTINGS);

  // Use asyncStoragePlugin for persistence
  injectEffect(() => {
    const plugin = asyncStoragePlugin({
      key: 'app_settings',
      debounceMs: 300,
      serialize: (value: SettingsAtomState) => {
        // Apply defaults for missing fields before serializing
        const settingsWithDefaults = {
          ...DEFAULT_SETTINGS,
          ...value,
          downloadSettings: {
            ...DEFAULT_DOWNLOAD_SETTINGS,
            ...(value.downloadSettings || {}),
          },
        };

        // Handle legacy migration: searchLayout → defaultLayout
        const serialized: any = { ...settingsWithDefaults };
        if ('searchLayout' in serialized && !serialized.defaultLayout) {
          serialized.defaultLayout = serialized.searchLayout;
          delete serialized.searchLayout;
        }

        return JSON.stringify(serialized);
      },
      deserialize: (value: string) => {
        try {
          const parsed = JSON.parse(value);

          // Apply defaults for missing fields
          const settings: SettingsAtomState = {
            ...DEFAULT_SETTINGS,
            ...parsed,
            downloadSettings: {
              ...DEFAULT_DOWNLOAD_SETTINGS,
              ...(parsed.downloadSettings || {}),
            },
          };

          // Handle legacy migration: searchLayout → defaultLayout
          if ('searchLayout' in parsed && !settings.defaultLayout) {
            settings.defaultLayout = parsed.searchLayout || 'list';
          }

          return settings;
        } catch (error) {
          logger().error('Storage', 'Failed to deserialize settings', {
            error,
          });
          return DEFAULT_SETTINGS;
        }
      },
    });

    // Apply the plugin to the store
    return plugin(store as any);
  }, []);

  const updateSettings = (updates: Partial<SettingsAtomState>) => {
    const currentState = store.getState();
    store.setState({
      ...currentState,
      ...updates,
      // Ensure download settings are merged properly
      downloadSettings: updates.downloadSettings
        ? {
            ...currentState.downloadSettings,
            ...updates.downloadSettings,
          }
        : currentState.downloadSettings,
    });
  };

  return api(store).setExports({
    updateSettings,
  });
});
