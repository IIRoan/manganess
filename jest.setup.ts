import '@testing-library/react-native';
import 'react-native-gesture-handler/jestSetup';

// Suppress console output during tests to reduce noise
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleLog = console.log;

beforeAll(() => {
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
  console.log = originalConsoleLog;
});

jest.mock('react-native-reanimated', () => {
  const ReactNative = require('react-native');
  const ID = <T>(value: T) => value;
  const NOOP = () => { };
  const animationBuilder = {
    delay: () => animationBuilder,
    duration: () => animationBuilder,
    springify: () => animationBuilder,
    damping: () => animationBuilder,
    stiffness: () => animationBuilder,
    mass: () => animationBuilder,
    overshootClamping: () => animationBuilder,
    withCallback: () => animationBuilder,
    withInitialValues: () => animationBuilder,
    easing: () => animationBuilder,
    reduceMotion: () => animationBuilder,
  };

  const Easing = {
    linear: ID,
    ease: ID,
    out: ID,
    in: ID,
    inOut: ID,
    bezier: () => ID,
  };

  return {
    __esModule: true,
    default: {
      View: ReactNative.View,
      Text: ReactNative.Text,
      Image: ReactNative.Image,
      ScrollView: ReactNative.ScrollView,
      FlatList: ReactNative.FlatList,
      createAnimatedComponent: ID,
      addWhitelistedUIProps: NOOP,
      addWhitelistedNativeProps: NOOP,
      call: NOOP,
    },
    runOnJS: (fn: (...args: any[]) => any) => fn,
    runOnUI: (fn: (...args: any[]) => any) => fn,
    createWorkletRuntime: NOOP,
    runOnRuntime: NOOP,
    makeMutable: ID,
    createSerializable: ID,
    isReanimated3: () => false,
    enableLayoutAnimations: NOOP,
    useAnimatedStyle: (updater: () => any) => updater(),
    useAnimatedProps: (updater: () => any) => updater(),
    useAnimatedReaction: NOOP,
    useAnimatedRef: () => ({ current: null }),
    useAnimatedScrollHandler: () => NOOP,
    useDerivedValue: () => ({ value: undefined }),
    useEvent: () => NOOP,
    useSharedValue: (value: any) => ({ value }),
    useAnimatedSensor: () => ({
      sensor: { value: { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0 } },
      unregister: NOOP,
      isAvailable: false,
      config: { interval: 0 },
    }),
    useAnimatedKeyboard: () => ({ height: 0, state: 0 }),
    useScrollViewOffset: () => ({ value: 0 }),
    useScrollOffset: () => ({ value: 0 }),
    withDecay: (_config: any, callback?: (finished: boolean) => void) => {
      callback?.(true);
      return 0;
    },
    withDelay: (_delay: number, nextAnimation: any) => nextAnimation,
    withRepeat: ID,
    withSequence: (...animations: any[]) => animations[animations.length - 1],
    withSpring: (
      toValue: any,
      _config?: any,
      callback?: (finished: boolean) => void
    ) => {
      callback?.(true);
      return toValue;
    },
    withTiming: (
      toValue: any,
      _config?: any,
      callback?: (finished: boolean) => void
    ) => {
      callback?.(true);
      return toValue;
    },
    cancelAnimation: NOOP,
    measure: () => ({ x: 0, y: 0, width: 0, height: 0, pageX: 0, pageY: 0 }),
    scrollTo: NOOP,
    Easing,
    Extrapolation: {
      CLAMP: 'clamp',
      EXTEND: 'extend',
      IDENTITY: 'identity',
    },
    Extrapolate: {
      CLAMP: 'clamp',
      EXTEND: 'extend',
      IDENTITY: 'identity',
    },
    interpolate: NOOP,
    interpolateColor: NOOP,
    clamp: NOOP,
    processColor: ReactNative.processColor,
    FadeIn: animationBuilder,
    FadeInDown: animationBuilder,
    FadeOut: animationBuilder,
    FadeOutDown: animationBuilder,
    SlideInRight: animationBuilder,
    SlideOutLeft: animationBuilder,
  };
});

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('expo-modules-core', () => {
  class MockEventEmitter {
    addListener() {
      return { remove: jest.fn() };
    }
    removeAllListeners() { }
    removeSubscription() { }
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
  const mockFsContents = new Map<string, string>();

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
    async write(contents?: string) {
      mockFsContents.set(this.uri, String(contents ?? ''));
    }
    async delete() {
      mockFsContents.delete(this.uri);
    }
    async read() {
      return mockFsContents.get(this.uri) ?? '';
    }
    async text() {
      return mockFsContents.get(this.uri) ?? '';
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
    async create() { }
    delete() { }
    list() {
      return [];
    }
  }

  const Paths = {
    cache: 'mock-cache',
    document: 'mock-docs',
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
      patchCachedChapterApiId: jest.fn(
        async (id: string, chapterNumber: string, chapterApiId: string) => {
          const existing = mockOfflineCacheStore.get(id);
          if (!existing?.chapters) {
            return false;
          }
          const nextUrl = `/chapter/${chapterApiId}`;
          let changed = false;
          const chapters = existing.chapters.map((chapter: any) => {
            if (String(chapter.number) !== String(chapterNumber)) {
              return chapter;
            }
            if (chapter.url === nextUrl) {
              return chapter;
            }
            changed = true;
            return { ...chapter, url: nextUrl };
          });
          if (!changed) {
            return false;
          }
          mockOfflineCacheStore.set(id, {
            ...existing,
            chapters,
            cachedAt: Date.now(),
          });
          return true;
        }
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
      getChapterImages: jest.fn(async (mangaId: string, chapterNumber: string) => {
        return downloads.get(mangaId)?.get(chapterNumber) ?? null;
      }),
      downloadAndSaveImage: jest.fn(
        async (
          mangaId: string,
          chapterNumber: string,
          image: any
        ) => {
          const saved = {
            ...image,
            localPath: `file://mock/${mangaId}/${chapterNumber}/${image.pageNumber}.jpg`,
            fileSize: 1024,
            downloadStatus: 'completed',
          };
          const chapters = downloads.get(mangaId) ?? new Map<string, any>();
          const existing = chapters.get(chapterNumber) ?? [];
          chapters.set(chapterNumber, [...existing, saved]);
          downloads.set(mangaId, chapters);
          return saved;
        }
      ),
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

jest.mock('expo-font', () => ({
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: jest.fn(() => true),
  isLoading: jest.fn(() => false),
}));

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn(() => ({
      downloadAsync: jest.fn(() => Promise.resolve()),
    })),
    loadAsync: jest.fn(() => Promise.resolve()),
  },
}));
