import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getAppSettings,
  setAppSettings,
  getDebugTabEnabled,
  setDebugTabEnabled,
  isOnboardingCompleted,
  setOnboardingCompleted,
  exportAppData,
  importAppData,
  clearAppData,
  refreshMangaImages,
  migrateToNewStorage,
} from '../settingsService';

jest.mock('../bookmarkService', () => ({
  setMangaData: jest.fn(),
  getMangaData: jest.fn(),
}));

jest.mock('../mangaFireService', () => ({
  fetchMangaDetails: jest.fn(),
}));

jest.mock('../CacheImages', () => ({
  imageCache: {
    clearCache: jest.fn(),
  },
}));

const { setMangaData, getMangaData } = require('../bookmarkService');
const { fetchMangaDetails } = require('../mangaFireService');
const { imageCache } = require('../CacheImages');

describe('settingsService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('returns default app settings when none stored', async () => {
    const settings = await getAppSettings();
    expect(settings).toEqual({
      theme: 'system',
      enableDebugTab: false,
      onboardingCompleted: false,
      accentColor: undefined,
      downloadSettings: {
        maxConcurrentDownloads: 3,
        maxStorageSize: 2147483648,
        autoDownloadBookmarked: false,
        downloadQuality: 'original',
        enableBackgroundDownloads: true,
        storageWarningThreshold: 85,
        autoCleanupEnabled: false,
        autoCleanupDays: 30,
      },
    });
  });

  it('saves and retrieves app settings', async () => {
    const nextSettings = {
      theme: 'dark' as const,
      enableDebugTab: true,
      onboardingCompleted: true,
      accentColor: '#fff',
    };
    await setAppSettings(nextSettings);
    const result = await getAppSettings();
    expect(result).toEqual({
      ...nextSettings,
      downloadSettings: {
        maxConcurrentDownloads: 3,
        maxStorageSize: 2147483648,
        autoDownloadBookmarked: false,
        downloadQuality: 'original',
        enableBackgroundDownloads: true,
        storageWarningThreshold: 85,
        autoCleanupEnabled: false,
        autoCleanupDays: 30,
      },
    });
  });

  it('updates individual toggles via helpers', async () => {
    expect(await getDebugTabEnabled()).toBe(false);
    await setDebugTabEnabled(true);
    expect(await getDebugTabEnabled()).toBe(true);

    expect(await isOnboardingCompleted()).toBe(false);
    await setOnboardingCompleted(true);
    expect(await isOnboardingCompleted()).toBe(true);
  });

  it('exports and imports raw app data', async () => {
    await AsyncStorage.setItem('foo', JSON.stringify({ a: 1 }));
    await AsyncStorage.setItem('bar', 'baz');

    const exported = await exportAppData();
    expect(exported.foo).toEqual({ a: 1 });
    expect(exported.bar).toBe('baz');

    await clearAppData();
    await importAppData(exported);

    expect(await AsyncStorage.getItem('foo')).toBe(JSON.stringify({ a: 1 }));
    expect(await AsyncStorage.getItem('bar')).toBe('baz');
  });

  it('refreshes manga images and updates stored entries', async () => {
    const mangaKey = 'manga_123';
    await AsyncStorage.setItem(
      mangaKey,
      JSON.stringify({ id: '123', bannerImage: 'old.jpg', readChapters: [1] })
    );

    (getMangaData as jest.Mock).mockResolvedValue({
      id: '123',
      bannerImage: 'old.jpg',
      readChapters: ['1'],
    });
    (fetchMangaDetails as jest.Mock).mockResolvedValue({
      bannerImage: 'new.jpg',
      title: 'Updated',
    });

    const result = await refreshMangaImages();

    expect(imageCache.clearCache).toHaveBeenCalled();
    expect(setMangaData).toHaveBeenCalledWith(
      expect.objectContaining({ bannerImage: 'new.jpg' })
    );
    expect(result.success).toBe(true);
    expect(result.message).toContain('1');
  });

  it('migrates legacy bookmark storage to new format', async () => {
    await AsyncStorage.multiSet([
      ['bookmark_1', 'Reading'],
      ['title_1', 'Old Title'],
      ['image_1', 'old.png'],
      ['manga_1_read_chapters', JSON.stringify(['1'])],
    ]);

    (fetchMangaDetails as jest.Mock).mockResolvedValue({
      title: 'New Title',
      bannerImage: 'new.png',
    });

    const result = await migrateToNewStorage();

    expect(imageCache.clearCache).toHaveBeenCalled();
    expect(setMangaData).toHaveBeenCalledWith(
      expect.objectContaining({
        id: '1',
        title: 'New Title',
        bannerImage: 'new.png',
        bookmarkStatus: 'Reading',
      })
    );
    expect(result.success).toBe(true);
    expect(await AsyncStorage.getItem('bookmark_1')).toBeNull();
  });
});
