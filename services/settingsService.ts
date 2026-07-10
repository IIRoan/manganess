import AsyncStorage from '@react-native-async-storage/async-storage';
import { setMangaData, getMangaData, removeBookmarkKeyFromIndex } from './bookmarkService';
import { fetchMangaDetails } from './mangaFireService';
import { resolveStoredMangaId } from './mangaIdMigrationService';
import { imageCache } from './CacheImages';
import { logger } from '@/utils/logger';

interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  enableDebugTab: boolean;
  onboardingCompleted: boolean;
  accentColor?: string | undefined;
  defaultLayout: 'grid' | 'list';
  downloadSettings?: DownloadSettings;
}

interface DownloadSettings {
  maxConcurrentDownloads: number;
  maxStorageSize: number; // in bytes
  autoDownloadBookmarked: boolean;
  downloadQuality: 'original' | 'compressed';
  enableBackgroundDownloads: boolean;
  storageWarningThreshold: number; // percentage (0-100)
  autoCleanupEnabled: boolean;
  autoCleanupDays: number; // days after which to auto-cleanup
}

const SETTINGS_KEY = 'app_settings';

const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  maxConcurrentDownloads: 3,
  maxStorageSize: 2 * 1024 * 1024 * 1024, // 2GB
  autoDownloadBookmarked: false,
  downloadQuality: 'original',
  enableBackgroundDownloads: true,
  storageWarningThreshold: 85, // 85%
  autoCleanupEnabled: false,
  autoCleanupDays: 30,
};

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const settingsStr = await AsyncStorage.getItem(SETTINGS_KEY);
    if (settingsStr) {
      const settings = JSON.parse(settingsStr);
      // Ensure download settings exist with defaults
      if (!settings.downloadSettings) {
        settings.downloadSettings = DEFAULT_DOWNLOAD_SETTINGS;
      }
      // Ensure default layout exists
      if (!settings.defaultLayout) {
        // Fallback to searchLayout if it exists (migration)
        settings.defaultLayout = settings.searchLayout || 'list';
      }
      return settings;
    }
    return {
      theme: 'system',
      enableDebugTab: false,
      onboardingCompleted: false,
      accentColor: undefined,
      defaultLayout: 'grid',
      downloadSettings: DEFAULT_DOWNLOAD_SETTINGS,
    };
  } catch (error) {
    logger().error('Service', 'Error getting app settings', { error });
    return {
      theme: 'system',
      enableDebugTab: false,
      onboardingCompleted: false,
      accentColor: undefined,
      defaultLayout: 'grid',
      downloadSettings: DEFAULT_DOWNLOAD_SETTINGS,
    };
  }
}

export async function setAppSettings(settings: AppSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    logger().error('Service', 'Error saving app settings', { error });
  }
}

export async function getDefaultLayout(): Promise<'grid' | 'list'> {
  const settings = await getAppSettings();
  return settings.defaultLayout;
}

export async function setDefaultLayout(layout: 'grid' | 'list'): Promise<void> {
  const settings = await getAppSettings();
  settings.defaultLayout = layout;
  await setAppSettings(settings);
}

export async function getDebugTabEnabled(): Promise<boolean> {
  const settings = await getAppSettings();
  return settings.enableDebugTab;
}

export async function setDebugTabEnabled(enabled: boolean): Promise<void> {
  const settings = await getAppSettings();
  settings.enableDebugTab = enabled;
  await setAppSettings(settings);
}

export async function isOnboardingCompleted(): Promise<boolean> {
  const settings = await getAppSettings();
  return settings.onboardingCompleted;
}

export async function setOnboardingCompleted(
  completed: boolean
): Promise<void> {
  const settings = await getAppSettings();
  settings.onboardingCompleted = completed;
  await setAppSettings(settings);
}

export async function exportAppData() {
  const allKeys = await AsyncStorage.getAllKeys();
  const allPairs = await AsyncStorage.multiGet(allKeys);
  const exportData: Record<string, any> = {};

  allPairs.forEach(([key, value]) => {
    if (value) {
      try {
        exportData[key] = JSON.parse(value);
      } catch {
        exportData[key] = value;
      }
    }
  });

  return exportData;
}

export async function importAppData(data: Record<string, any>) {
  await AsyncStorage.clear();
  const pairs: [string, string][] = Object.entries(data).map(([key, value]) => [
    key,
    typeof value === 'string' ? value : JSON.stringify(value),
  ]);
  await AsyncStorage.multiSet(pairs);
}

export async function clearAppData() {
  await AsyncStorage.clear();
}

export async function refreshMangaImages(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const mangaKeys = allKeys.filter((key) => key.startsWith('manga_'));
    let updatedCount = 0;

    // Clear the image cache before starting refresh
    await imageCache.clearCache();

    for (const key of mangaKeys) {
      const mangaId = key.replace('manga_', '');
      const mangaData = await getMangaData(mangaId);

      if (mangaData) {
        try {
          const newMangaDetails = await fetchMangaDetails(mangaId);
          if (newMangaDetails?.bannerImage) {
            await setMangaData({
              ...mangaData,
              bannerImage: newMangaDetails.bannerImage,
              lastUpdated: Date.now(),
            });
            updatedCount++;
          }
        } catch (error) {
          logger().error('Service', 'Error updating manga', { mangaId, error });
        }
      }
    }

    return {
      success: true,
      message: `Updated images for ${updatedCount} manga out of ${mangaKeys.length} total`,
    };
  } catch (error) {
    logger().error('Service', 'Error refreshing manga images', { error });
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function migrateToNewStorage(): Promise<{
  success: boolean;
  message: string;
}> {
  const log = logger();

  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const bookmarkKeys = allKeys.filter(
      (key) =>
        key.startsWith('bookmark_') &&
        key !== 'bookmarkKeys' &&
        key !== 'bookmarkChanged'
    );

    await imageCache.clearCache();

    let migratedCount = 0;
    let remappedCount = 0;
    let localOnlyCount = 0;
    let failedCount = 0;

    for (const bookmarkKey of bookmarkKeys) {
      const legacyId = bookmarkKey.replace('bookmark_', '');

      try {
        const [bookmarkStatus, title, imageUrl, readChaptersStr] =
          await AsyncStorage.multiGet([
            bookmarkKey,
            `title_${legacyId}`,
            `image_${legacyId}`,
            `manga_${legacyId}_read_chapters`,
          ]);

        const readChapters = readChaptersStr?.[1]
          ? JSON.parse(readChaptersStr[1])
          : [];
        const localTitle = title?.[1] || '';
        const localImage = imageUrl?.[1] || '';

        const resolution = await resolveStoredMangaId(
          legacyId,
          localTitle || undefined
        );

        let targetId = legacyId;
        let mangaTitle = localTitle;
        let bannerImage = localImage;

        if (resolution.action === 'use_current') {
          targetId = resolution.id;
          mangaTitle = resolution.title || mangaTitle;
          bannerImage = resolution.bannerImage || bannerImage;
        } else if (resolution.action === 'remap') {
          targetId = resolution.toId;
          mangaTitle = resolution.title || mangaTitle;
          bannerImage = resolution.bannerImage || bannerImage;
          remappedCount++;
        } else {
          try {
            const mangaDetails = await fetchMangaDetails(legacyId);
            mangaTitle = mangaDetails?.title || mangaTitle;
            bannerImage = mangaDetails?.bannerImage || bannerImage;
          } catch (error) {
            localOnlyCount++;
            log.warn('Service', 'Using local bookmark data during migration', {
              legacyId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }

        await setMangaData({
          id: targetId,
          title: mangaTitle,
          bannerImage,
          bookmarkStatus: (bookmarkStatus?.[1] as any) || null,
          readChapters,
          lastReadChapter:
            readChapters.length > 0
              ? readChapters[readChapters.length - 1]
              : undefined,
          lastUpdated: Date.now(),
        });

        if (targetId !== legacyId) {
          await removeBookmarkKeyFromIndex(legacyId);
        }

        await AsyncStorage.multiRemove([
          bookmarkKey,
          `title_${legacyId}`,
          `image_${legacyId}`,
          `manga_${legacyId}_read_chapters`,
        ]);

        migratedCount++;
      } catch (error) {
        failedCount++;
        log.error('Service', 'Failed to migrate legacy bookmark', {
          legacyId,
          error,
        });
      }
    }

    if (migratedCount === 0 && failedCount > 0) {
      return {
        success: false,
        message: `Migration failed for all ${failedCount} bookmark${
          failedCount === 1 ? '' : 's'
        }`,
      };
    }

    const parts = [
      `Migrated ${migratedCount} manga to the new storage format`,
    ];

    if (remappedCount > 0) {
      parts.push(`${remappedCount} updated to new MangaFire links`);
    }
    if (localOnlyCount > 0) {
      parts.push(
        `${localOnlyCount} kept with saved title/image (could not verify online)`
      );
    }
    if (failedCount > 0) {
      parts.push(`${failedCount} failed`);
    }

    return {
      success: true,
      message: parts.join('. '),
    };
  } catch (error) {
    log.error('Service', 'Error during migration', { error });
    return {
      success: false,
      message: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// Download Settings Functions

export async function getDownloadSettings(): Promise<DownloadSettings> {
  try {
    const appSettings = await getAppSettings();
    return appSettings.downloadSettings || DEFAULT_DOWNLOAD_SETTINGS;
  } catch (error) {
    logger().error('Service', 'Error getting download settings', { error });
    return DEFAULT_DOWNLOAD_SETTINGS;
  }
}

export async function updateDownloadSettings(
  newSettings: Partial<DownloadSettings>
): Promise<void> {
  try {
    const appSettings = await getAppSettings();
    const currentDownloadSettings =
      appSettings.downloadSettings || DEFAULT_DOWNLOAD_SETTINGS;

    appSettings.downloadSettings = {
      ...currentDownloadSettings,
      ...newSettings,
    };

    await setAppSettings(appSettings);
  } catch (error) {
    logger().error('Service', 'Error updating download settings', { error });
    throw error;
  }
}

export async function resetDownloadSettings(): Promise<void> {
  try {
    const appSettings = await getAppSettings();
    appSettings.downloadSettings = DEFAULT_DOWNLOAD_SETTINGS;
    await setAppSettings(appSettings);
  } catch (error) {
    logger().error('Service', 'Error resetting download settings', { error });
    throw error;
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function getStorageSizeOptions(): Array<{
  label: string;
  value: number;
}> {
  return [
    { label: '500 MB', value: 500 * 1024 * 1024 },
    { label: '1 GB', value: 1024 * 1024 * 1024 },
    { label: '2 GB', value: 2 * 1024 * 1024 * 1024 },
    { label: '5 GB', value: 5 * 1024 * 1024 * 1024 },
    { label: '10 GB', value: 10 * 1024 * 1024 * 1024 },
    { label: '20 GB', value: 20 * 1024 * 1024 * 1024 },
  ];
}
