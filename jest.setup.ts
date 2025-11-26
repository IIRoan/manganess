import '@testing-library/jest-native/extend-expect';
import 'react-native-gesture-handler/jestSetup';

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  Reanimated.runOnJS = () => () => {};
  Reanimated.useDerivedValue = () => {};
  return Reanimated;
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-modules-core', () => {
  class MockEventEmitter {
    addListener() {
      return { remove: jest.fn() };
    }
    removeAllListeners() {}
    removeSubscription() {}
  }

  return {
    EventEmitter: MockEventEmitter,
    NativeModulesProxy: {},
    requireNativeModule: jest.fn(() => ({
      addListener: jest.fn(),
      removeListeners: jest.fn(),
    })),
    requireOptionalNativeModule: jest.fn(() => null),
    Platform: { OS: 'test' },
  };
});

jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    constructor(dir: any, name?: string) {
      if (typeof dir === 'string') {
        this.uri = name ? `${dir}/${name}` : dir;
      } else {
        const base = dir?.uri ?? 'mock://dir';
        this.uri = name ? `${base}/${name}` : base;
      }
    }
    get exists() {
      return true;
    }
    async write() {}
    async delete() {}
    async read() {
      return '';
    }
    info() {
      return { exists: true, size: 0, uri: this.uri };
    }
    static downloadFileAsync = jest.fn(
      async (_src: string, destFile: MockFile) => destFile
    );
  }

  class MockDirectory {
    uri: string;
    parentDirectory?: MockDirectory;
    constructor(parent: any, name?: string) {
      if (typeof parent === 'string') {
        this.uri = name ? `${parent}/${name}` : parent;
      } else {
        const base = parent?.uri ?? 'mock://dir';
        this.uri = name ? `${base}/${name}` : base;
        this.parentDirectory = parent;
      }
    }
    get exists() {
      return true;
    }
    async create() {}
    delete() {}
    list() {
      return [];
    }
  }

  const Paths = {
    cache: 'mock-cache',
    documentDirectory: 'mock-docs',
    availableDiskSpace: 10 * 1024 * 1024 * 1024,
    totalDiskSpace: 64 * 1024 * 1024 * 1024,
  };

  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths,
  };
});

jest.mock('@react-native-community/netinfo', () => {
  return {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(() =>
      Promise.resolve({
        isConnected: true,
        isInternetReachable: true,
        type: 'wifi',
      })
    ),
  };
});

const mockOfflineCacheStore = new Map<string, any>();

jest.mock('@/services/offlineCacheService', () => {
  const buildEntry = (details: any, isBookmarked: boolean) => ({
    ...details,
    cachedAt: Date.now(),
    isBookmarked,
  });

  return {
    offlineCacheService: {
      cacheMangaDetails: jest.fn(
        async (id: string, details: any, isBookmarked: boolean) => {
          mockOfflineCacheStore.set(id, buildEntry(details, isBookmarked));
        }
      ),
      getCachedMangaDetails: jest.fn(
        async (id: string) => mockOfflineCacheStore.get(id) ?? null
      ),
      getBookmarkedMangaDetails: jest.fn(async () =>
        Array.from(mockOfflineCacheStore.values()).filter(
          (entry: any) => entry.isBookmarked
        )
      ),
      updateMangaBookmarkStatus: jest.fn(
        async (id: string, isBookmarked: boolean) => {
          const existing = mockOfflineCacheStore.get(id);
          if (existing) {
            mockOfflineCacheStore.set(id, { ...existing, isBookmarked });
          }
        }
      ),
      getAllCachedMangaDetails: jest.fn(async () => {
        const entries: Record<string, any> = {};
        mockOfflineCacheStore.forEach((value, key) => {
          entries[key] = value;
        });
        return entries;
      }),
      cacheSearchResults: jest.fn(),
      getCachedSearchResults: jest.fn(async () => null),
      getAllCachedSearchResults: jest.fn(async () => ({})),
      cacheHomeData: jest.fn(),
      getCachedHomeData: jest.fn(async () => null),
      clearAllCache: jest.fn(async () => {
        mockOfflineCacheStore.clear();
      }),
      getCacheStats: jest.fn(async () => ({
        mangaCount: mockOfflineCacheStore.size,
        bookmarkedCount: Array.from(mockOfflineCacheStore.values()).filter(
          (entry: any) => entry.isBookmarked
        ).length,
        searchQueriesCount: 0,
        hasHomeData: false,
        totalSizeEstimate: '0 B',
      })),
    },
  };
});

jest.mock('@/services/chapterStorageService', () => {
  const downloads = new Map<string, Map<string, any>>();

  return {
    chapterStorageService: {
      getDownloadedChapters: jest.fn(async (mangaId: string) => {
        return Array.from(downloads.get(mangaId)?.keys() ?? []);
      }),
      isChapterDownloaded: jest.fn(
        async (mangaId: string, chapterNumber: string) => {
          return downloads.get(mangaId)?.has(chapterNumber) ?? false;
        }
      ),
      getChapterImages: jest.fn(async () => []),
      saveChapterImages: jest.fn(
        async (mangaId: string, chapterNumber: string, images: any[]) => {
          const chapters = downloads.get(mangaId) ?? new Map<string, any>();
          chapters.set(chapterNumber, images);
          downloads.set(mangaId, chapters);
        }
      ),
      deleteChapter: jest.fn(async (mangaId: string, chapterNumber: string) => {
        downloads.get(mangaId)?.delete(chapterNumber);
      }),
      getStorageStats: jest.fn(async () => ({
        totalSize: 0,
        totalChapters: 0,
        mangaCount: downloads.size,
        availableSpace: 0,
        oldestDownload: 0,
      })),
      getDownloadSettings: jest.fn(async () => ({
        maxConcurrentDownloads: 3,
        maxStorageSize: 1024,
        autoDownloadBookmarked: false,
        downloadQuality: 'original',
        enableBackgroundDownloads: true,
        storageWarningThreshold: 85,
        autoCleanupEnabled: false,
        autoCleanupDays: 30,
      })),
    },
  };
});

jest.mock('expo-constants', () => {
  return {
    manifest: {
      extra: {},
    },
    platform: {
      ios: {},
      android: {},
    },
  };
});

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(),
}));
