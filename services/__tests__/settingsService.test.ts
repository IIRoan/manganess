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
  getDefaultLayout,
  setDefaultLayout,
  getDownloadSettings,
  updateDownloadSettings,
  resetDownloadSettings,
  formatFileSize,
  getStorageSizeOptions,
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
      defaultLayout: 'list',
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
      defaultLayout: 'list' as const,
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

  describe('getDefaultLayout and setDefaultLayout', () => {
    it('returns default layout as list when none stored', async () => {
      const layout = await getDefaultLayout();
      expect(layout).toBe('list');
    });

    it('sets and retrieves default layout', async () => {
      await setDefaultLayout('grid');
      const layout = await getDefaultLayout();
      expect(layout).toBe('grid');
    });

    it('migrates from legacy searchLayout to defaultLayout', async () => {
      // Store settings with searchLayout instead of defaultLayout
      await AsyncStorage.setItem(
        'app_settings',
        JSON.stringify({
          theme: 'system',
          enableDebugTab: false,
          onboardingCompleted: false,
          searchLayout: 'grid',
        })
      );

      const settings = await getAppSettings();
      expect(settings.defaultLayout).toBe('grid');
    });
  });

  describe('getAppSettings error handling', () => {
    it('returns defaults when JSON parsing fails', async () => {
      await AsyncStorage.setItem('app_settings', 'invalid-json');

      const settings = await getAppSettings();

      expect(settings.theme).toBe('system');
      expect(settings.enableDebugTab).toBe(false);
      expect(settings.defaultLayout).toBe('list');
    });

    it('returns defaults when AsyncStorage throws', async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      const settings = await getAppSettings();

      expect(settings.theme).toBe('system');
      expect(settings.defaultLayout).toBe('list');
    });
  });

  describe('setAppSettings error handling', () => {
    it('handles AsyncStorage error gracefully', async () => {
      jest
        .spyOn(AsyncStorage, 'setItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      // Should not throw
      await expect(
        setAppSettings({
          theme: 'dark',
          enableDebugTab: true,
          onboardingCompleted: true,
          defaultLayout: 'grid',
        })
      ).resolves.not.toThrow();
    });
  });

  describe('Download Settings', () => {
    it('returns default download settings when none stored', async () => {
      const downloadSettings = await getDownloadSettings();

      expect(downloadSettings).toEqual({
        maxConcurrentDownloads: 3,
        maxStorageSize: 2147483648,
        autoDownloadBookmarked: false,
        downloadQuality: 'original',
        enableBackgroundDownloads: true,
        storageWarningThreshold: 85,
        autoCleanupEnabled: false,
        autoCleanupDays: 30,
      });
    });

    it('updates partial download settings', async () => {
      await updateDownloadSettings({
        maxConcurrentDownloads: 5,
        autoDownloadBookmarked: true,
      });

      const settings = await getDownloadSettings();

      expect(settings.maxConcurrentDownloads).toBe(5);
      expect(settings.autoDownloadBookmarked).toBe(true);
      // Other settings should remain default
      expect(settings.maxStorageSize).toBe(2147483648);
    });

    it('resets download settings to defaults', async () => {
      await updateDownloadSettings({
        maxConcurrentDownloads: 10,
        autoDownloadBookmarked: true,
      });

      await resetDownloadSettings();

      const settings = await getDownloadSettings();

      expect(settings.maxConcurrentDownloads).toBe(3);
      expect(settings.autoDownloadBookmarked).toBe(false);
    });

    it('handles error in getDownloadSettings', async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      const settings = await getDownloadSettings();

      expect(settings.maxConcurrentDownloads).toBe(3);
    });

    it('handles error in updateDownloadSettings gracefully', async () => {
      // setAppSettings catches errors internally, so updateDownloadSettings won't throw
      jest
        .spyOn(AsyncStorage, 'setItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      // Should not throw - errors are caught internally
      await expect(
        updateDownloadSettings({ maxConcurrentDownloads: 5 })
      ).resolves.not.toThrow();
    });

    it('handles error in resetDownloadSettings gracefully', async () => {
      // First mock getItem to succeed, then setItem to fail
      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValueOnce(
        JSON.stringify({
          theme: 'system',
          enableDebugTab: false,
          onboardingCompleted: false,
          defaultLayout: 'list',
        })
      );
      jest
        .spyOn(AsyncStorage, 'setItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      // Should not throw - errors are caught internally by setAppSettings
      await expect(resetDownloadSettings()).resolves.not.toThrow();
    });
  });

  describe('formatFileSize', () => {
    it('formats 0 bytes correctly', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('formats bytes correctly', () => {
      expect(formatFileSize(500)).toBe('500 B');
    });

    it('formats kilobytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
      expect(formatFileSize(2048)).toBe('2 KB');
    });

    it('formats megabytes correctly', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1 MB');
      expect(formatFileSize(5 * 1024 * 1024)).toBe('5 MB');
    });

    it('formats gigabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024)).toBe('1 GB');
      expect(formatFileSize(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
    });

    it('formats terabytes correctly', () => {
      expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1 TB');
    });
  });

  describe('getStorageSizeOptions', () => {
    it('returns array of storage size options', () => {
      const options = getStorageSizeOptions();

      expect(options).toBeInstanceOf(Array);
      expect(options.length).toBe(6);
    });

    it('contains expected size values', () => {
      const options = getStorageSizeOptions();

      expect(options.map((o) => o.label)).toEqual([
        '500 MB',
        '1 GB',
        '2 GB',
        '5 GB',
        '10 GB',
        '20 GB',
      ]);
    });

    it('has correct byte values', () => {
      const options = getStorageSizeOptions();

      expect(options[0]!.value).toBe(500 * 1024 * 1024);
      expect(options[1]!.value).toBe(1024 * 1024 * 1024);
      expect(options[2]!.value).toBe(2 * 1024 * 1024 * 1024);
    });
  });

  describe('refreshMangaImages edge cases', () => {
    it('handles empty manga list', async () => {
      const result = await refreshMangaImages();

      expect(imageCache.clearCache).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toContain('0 manga out of 0');
    });

    it('skips manga when getMangaData returns null', async () => {
      await AsyncStorage.setItem(
        'manga_123',
        JSON.stringify({ id: '123', bannerImage: 'old.jpg' })
      );

      (getMangaData as jest.Mock).mockResolvedValue(null);

      const result = await refreshMangaImages();

      expect(result.success).toBe(true);
      expect(setMangaData).not.toHaveBeenCalled();
    });

    it('skips manga when fetchMangaDetails returns null bannerImage', async () => {
      await AsyncStorage.setItem(
        'manga_123',
        JSON.stringify({ id: '123', bannerImage: 'old.jpg' })
      );

      (getMangaData as jest.Mock).mockResolvedValue({
        id: '123',
        bannerImage: 'old.jpg',
      });
      (fetchMangaDetails as jest.Mock).mockResolvedValue({
        title: 'Test',
        bannerImage: null,
      });

      const result = await refreshMangaImages();

      expect(result.success).toBe(true);
      expect(setMangaData).not.toHaveBeenCalled();
    });

    it('continues processing other manga when one fails', async () => {
      await AsyncStorage.multiSet([
        ['manga_1', JSON.stringify({ id: '1', bannerImage: 'a.jpg' })],
        ['manga_2', JSON.stringify({ id: '2', bannerImage: 'b.jpg' })],
      ]);

      (getMangaData as jest.Mock)
        .mockResolvedValueOnce({ id: '1', bannerImage: 'a.jpg' })
        .mockResolvedValueOnce({ id: '2', bannerImage: 'b.jpg' });

      (fetchMangaDetails as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ bannerImage: 'new_b.jpg' });

      const result = await refreshMangaImages();

      expect(result.success).toBe(true);
      expect(setMangaData).toHaveBeenCalledTimes(1);
    });

    it('returns failure when overall operation fails', async () => {
      jest
        .spyOn(AsyncStorage, 'getAllKeys')
        .mockRejectedValueOnce(new Error('Storage error'));

      const result = await refreshMangaImages();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Storage error');
    });
  });

  describe('migrateToNewStorage edge cases', () => {
    it('handles empty bookmark list', async () => {
      const result = await migrateToNewStorage();

      expect(result.success).toBe(true);
      expect(result.message).toContain('0 manga');
    });

    it('handles missing optional data', async () => {
      await AsyncStorage.setItem('bookmark_1', 'Reading');

      (fetchMangaDetails as jest.Mock).mockResolvedValue({
        title: 'Fetched Title',
        bannerImage: 'fetched.jpg',
      });

      const result = await migrateToNewStorage();

      expect(result.success).toBe(true);
      expect(setMangaData).toHaveBeenCalledWith(
        expect.objectContaining({
          id: '1',
          title: 'Fetched Title',
          bannerImage: 'fetched.jpg',
          readChapters: [],
        })
      );
    });

    it('uses fallback title and image when fetch fails', async () => {
      await AsyncStorage.multiSet([
        ['bookmark_1', 'Reading'],
        ['title_1', 'Local Title'],
        ['image_1', 'local.jpg'],
      ]);

      (fetchMangaDetails as jest.Mock).mockResolvedValue(null);

      const result = await migrateToNewStorage();

      expect(result.success).toBe(true);
      expect(setMangaData).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Local Title',
          bannerImage: 'local.jpg',
        })
      );
    });

    it('returns failure when migration throws', async () => {
      jest
        .spyOn(AsyncStorage, 'getAllKeys')
        .mockRejectedValueOnce(new Error('Migration error'));

      const result = await migrateToNewStorage();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Migration error');
    });

    it('sets lastReadChapter from read chapters array', async () => {
      await AsyncStorage.multiSet([
        ['bookmark_1', 'Reading'],
        ['title_1', 'Test Manga'],
        ['manga_1_read_chapters', JSON.stringify(['1', '2', '5'])],
      ]);

      (fetchMangaDetails as jest.Mock).mockResolvedValue({
        title: 'Test Manga',
        bannerImage: 'test.jpg',
      });

      const result = await migrateToNewStorage();

      expect(result.success).toBe(true);
      expect(setMangaData).toHaveBeenCalledWith(
        expect.objectContaining({
          readChapters: ['1', '2', '5'],
          lastReadChapter: '5',
        })
      );
    });
  });
});
