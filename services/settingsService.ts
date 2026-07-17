import AsyncStorage from '@react-native-async-storage/async-storage';
import { setMangaData, getMangaData, removeBookmarkKeyFromIndex } from './bookmarkService';
import { fetchMangaDetails } from './mangaFireService';
import { resolveStoredMangaId } from './mangaIdMigrationService';
import { imageCache } from './CacheImages';
import { logger } from '@/utils/logger';
import type {
  ReaderContentProfile,
  ReaderProfileSettings,
  ReaderProfiles,
} from '@/types/settings';

type ReadingMode = 'auto' | 'vertical' | 'ltr' | 'rtl';
type ReaderBackground = 'default' | 'black' | 'white' | 'gray';
type ReaderImageFit = 'width' | 'height' | 'both' | 'fill';
type ProgressBarPosition = 'top' | 'bottom' | 'none';

interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  enableDebugTab: boolean;
  onboardingCompleted: boolean;
  accentColor?: string | undefined;
  defaultLayout: 'grid' | 'list';
  /** Mirrored from readerProfiles.manga for legacy callers. */
  readingMode: ReadingMode;
  readerBackground: ReaderBackground;
  showPageIndicator: boolean;
  readerImageFit: ReaderImageFit;
  progressBarPosition: ProgressBarPosition;
  readerDimPercent: number;
  keepHeaderVisible: boolean;
  readerProfiles: ReaderProfiles;
  /** When false, hide the settings gear in the chapter reader. */
  showReaderSettingsButton: boolean;
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

export const DEFAULT_MANGA_READER_PROFILE: ReaderProfileSettings = {
  readingMode: 'auto',
  readerBackground: 'default',
  readerImageFit: 'both',
  progressBarPosition: 'none',
  readerDimPercent: 0,
  keepHeaderVisible: false,
};

export const DEFAULT_MANHWA_READER_PROFILE: ReaderProfileSettings = {
  readingMode: 'vertical',
  readerBackground: 'default',
  readerImageFit: 'width',
  progressBarPosition: 'none',
  readerDimPercent: 0,
  keepHeaderVisible: false,
};

function createDefaultReaderProfiles(
  seed?: Partial<ReaderProfileSettings>
): ReaderProfiles {
  return {
    manga: { ...DEFAULT_MANGA_READER_PROFILE, ...seed },
    manhwa: { ...DEFAULT_MANHWA_READER_PROFILE, ...seed },
  };
}

function mirrorProfileToLegacyFields(
  settings: AppSettings,
  profile: ReaderProfileSettings
): void {
  settings.readingMode = profile.readingMode;
  settings.readerBackground = profile.readerBackground;
  settings.readerImageFit = profile.readerImageFit;
  settings.progressBarPosition = profile.progressBarPosition;
  settings.readerDimPercent = profile.readerDimPercent;
  settings.keepHeaderVisible = profile.keepHeaderVisible;
  settings.showPageIndicator = profile.progressBarPosition !== 'none';
}

function ensureReaderProfiles(settings: any): AppSettings {
  const legacySeed: Partial<ReaderProfileSettings> = {};
  if (settings.readingMode) legacySeed.readingMode = settings.readingMode;
  if (settings.readerBackground) {
    legacySeed.readerBackground = settings.readerBackground;
  }
  if (settings.readerImageFit) {
    legacySeed.readerImageFit = settings.readerImageFit;
  }
  if (settings.progressBarPosition) {
    legacySeed.progressBarPosition = settings.progressBarPosition;
  } else if (typeof settings.showPageIndicator === 'boolean') {
    legacySeed.progressBarPosition = settings.showPageIndicator
      ? 'top'
      : 'none';
  }
  if (typeof settings.readerDimPercent === 'number') {
    legacySeed.readerDimPercent = settings.readerDimPercent;
  }
  if (typeof settings.keepHeaderVisible === 'boolean') {
    legacySeed.keepHeaderVisible = settings.keepHeaderVisible;
  }

  if (!settings.readerProfiles) {
    // One-time migration from flat legacy reader fields into both profiles.
    settings.readerProfiles = createDefaultReaderProfiles(legacySeed);
  } else {
    settings.readerProfiles = {
      manga: {
        ...DEFAULT_MANGA_READER_PROFILE,
        ...(settings.readerProfiles.manga || {}),
      },
      manhwa: {
        ...DEFAULT_MANHWA_READER_PROFILE,
        ...(settings.readerProfiles.manhwa || {}),
      },
    };
  }

  mirrorProfileToLegacyFields(settings, settings.readerProfiles.manga);
  return settings as AppSettings;
}

function createDefaultAppSettings(): AppSettings {
  const readerProfiles = createDefaultReaderProfiles();
  return {
    theme: 'system',
    enableDebugTab: false,
    onboardingCompleted: false,
    accentColor: undefined,
    defaultLayout: 'list',
    readingMode: readerProfiles.manga.readingMode,
    readerBackground: readerProfiles.manga.readerBackground,
    showPageIndicator: false,
    readerImageFit: readerProfiles.manga.readerImageFit,
    progressBarPosition: 'none',
    readerDimPercent: 0,
    keepHeaderVisible: false,
    readerProfiles,
    showReaderSettingsButton: true,
    downloadSettings: DEFAULT_DOWNLOAD_SETTINGS,
  };
}

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const settingsStr = await AsyncStorage.getItem(SETTINGS_KEY);
    if (settingsStr) {
      const settings = JSON.parse(settingsStr);
      if (!settings.downloadSettings) {
        settings.downloadSettings = DEFAULT_DOWNLOAD_SETTINGS;
      }
      if (!settings.defaultLayout) {
        settings.defaultLayout = settings.searchLayout || 'list';
      }
      if (typeof settings.showReaderSettingsButton !== 'boolean') {
        settings.showReaderSettingsButton = true;
      }
      return ensureReaderProfiles(settings);
    }
    return createDefaultAppSettings();
  } catch (error) {
    logger().error('Service', 'Error getting app settings', { error });
    return createDefaultAppSettings();
  }
}

export async function setAppSettings(settings: AppSettings): Promise<void> {
  try {
    const normalized = ensureReaderProfiles({ ...settings });
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
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

export async function getReaderProfile(
  profile: ReaderContentProfile
): Promise<ReaderProfileSettings> {
  const settings = await getAppSettings();
  return { ...settings.readerProfiles[profile] };
}

export async function patchReaderProfile(
  profile: ReaderContentProfile,
  updates: Partial<ReaderProfileSettings>
): Promise<ReaderProfileSettings> {
  const settings = await getAppSettings();
  const nextProfile: ReaderProfileSettings = {
    ...settings.readerProfiles[profile],
    ...updates,
  };
  if (typeof updates.readerDimPercent === 'number') {
    nextProfile.readerDimPercent = Math.max(
      0,
      Math.min(70, Math.round(updates.readerDimPercent))
    );
  }
  settings.readerProfiles[profile] = nextProfile;
  if (profile === 'manga') {
    mirrorProfileToLegacyFields(settings, nextProfile);
  }
  await setAppSettings(settings);
  return nextProfile;
}

export async function getReadingMode(): Promise<ReadingMode> {
  const profile = await getReaderProfile('manga');
  return profile.readingMode;
}

export async function setReadingMode(mode: ReadingMode): Promise<void> {
  await patchReaderProfile('manga', { readingMode: mode });
}

export async function getReaderBackground(): Promise<ReaderBackground> {
  const profile = await getReaderProfile('manga');
  return profile.readerBackground;
}

export async function setReaderBackground(
  background: ReaderBackground
): Promise<void> {
  await patchReaderProfile('manga', { readerBackground: background });
}

export async function getShowPageIndicator(): Promise<boolean> {
  const settings = await getAppSettings();
  return settings.showPageIndicator;
}

export async function setShowPageIndicator(show: boolean): Promise<void> {
  await patchReaderProfile('manga', {
    progressBarPosition: show ? 'top' : 'none',
  });
}

export async function getReaderImageFit(): Promise<ReaderImageFit> {
  const profile = await getReaderProfile('manga');
  return profile.readerImageFit;
}

export async function setReaderImageFit(fit: ReaderImageFit): Promise<void> {
  await patchReaderProfile('manga', { readerImageFit: fit });
}

export async function getProgressBarPosition(): Promise<ProgressBarPosition> {
  const profile = await getReaderProfile('manga');
  return profile.progressBarPosition;
}

export async function setProgressBarPosition(
  position: ProgressBarPosition
): Promise<void> {
  await patchReaderProfile('manga', { progressBarPosition: position });
}

export async function getReaderDimPercent(): Promise<number> {
  const profile = await getReaderProfile('manga');
  return profile.readerDimPercent;
}

export async function setReaderDimPercent(percent: number): Promise<void> {
  await patchReaderProfile('manga', { readerDimPercent: percent });
}

export async function getKeepHeaderVisible(): Promise<boolean> {
  const profile = await getReaderProfile('manga');
  return profile.keepHeaderVisible;
}

export async function setKeepHeaderVisible(keep: boolean): Promise<void> {
  await patchReaderProfile('manga', { keepHeaderVisible: keep });
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

export async function getShowReaderSettingsButton(): Promise<boolean> {
  const settings = await getAppSettings();
  return settings.showReaderSettingsButton !== false;
}

export async function setShowReaderSettingsButton(
  show: boolean
): Promise<void> {
  const settings = await getAppSettings();
  settings.showReaderSettingsButton = show;
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
          const newMangaDetails = await fetchMangaDetails(mangaId, { force: true });
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
