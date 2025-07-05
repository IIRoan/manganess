import AsyncStorage from '@react-native-async-storage/async-storage';
import { setMangaData, getMangaData } from './bookmarkService';
import { fetchMangaDetails } from './mangaFireService';
import { imageCache } from './CacheImages';

interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  enableDebugTab: boolean;
  onboardingCompleted: boolean;
  accentColor?: string | undefined;
}

const SETTINGS_KEY = 'app_settings';

export async function getAppSettings(): Promise<AppSettings> {
  try {
    const settingsStr = await AsyncStorage.getItem(SETTINGS_KEY);
    if (settingsStr) {
      return JSON.parse(settingsStr);
    }
    return {
      theme: 'system',
      enableDebugTab: false,
      onboardingCompleted: false,
      accentColor: undefined,
    };
  } catch (error) {
    console.error('Error getting app settings:', error);
    return {
      theme: 'system',
      enableDebugTab: false,
      onboardingCompleted: false,
      accentColor: undefined,
    };
  }
}

export async function setAppSettings(settings: AppSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (error) {
    console.error('Error saving app settings:', error);
  }
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
          console.error(`Error updating manga ${mangaId}:`, error);
        }
      }
    }

    return {
      success: true,
      message: `Updated images for ${updatedCount} manga out of ${mangaKeys.length} total`,
    };
  } catch (error) {
    console.error('Error refreshing manga images:', error);
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
  try {
    // Get all keys
    const allKeys = await AsyncStorage.getAllKeys();

    // Get bookmark keys
    const bookmarkKeys = allKeys.filter((key) => key.startsWith('bookmark_'));

    // Clear image cache before migration
    await imageCache.clearCache();

    // Process each bookmark
    for (const bookmarkKey of bookmarkKeys) {
      const id = bookmarkKey.replace('bookmark_', '');

      // Get all related data
      const [bookmarkStatus, title, imageUrl, readChaptersStr] =
        await AsyncStorage.multiGet([
          bookmarkKey,
          `title_${id}`,
          `image_${id}`,
          `manga_${id}_read_chapters`,
        ]);

      // Parse read chapters
      const readChapters = readChaptersStr?.[1]
        ? JSON.parse(readChaptersStr[1])
        : [];

      // Fetch latest manga details
      const mangaDetails = await fetchMangaDetails(id);

      // Create new manga data structure
      await setMangaData({
        id,
        title: mangaDetails?.title || title?.[1] || '',
        bannerImage: mangaDetails?.bannerImage || imageUrl?.[1] || '',
        bookmarkStatus: (bookmarkStatus?.[1] as any) || null,
        readChapters,
        lastReadChapter:
          readChapters.length > 0
            ? readChapters[readChapters.length - 1]
            : undefined,
        lastUpdated: Date.now(),
      });

      // Delete old data
      await AsyncStorage.multiRemove([
        bookmarkKey,
        `title_${id}`,
        `image_${id}`,
        `manga_${id}_read_chapters`,
      ]);
    }

    return {
      success: true,
      message: `Successfully migrated ${bookmarkKeys.length} manga to new storage format`,
    };
  } catch (error) {
    console.error('Error during migration:', error);
    return {
      success: false,
      message: `Migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}
