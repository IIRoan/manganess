import AsyncStorage from '@react-native-async-storage/async-storage';
import { ImageDownloadStatus } from '@/types/download';
import { MANGA_IMAGE_REQUEST_HEADERS } from '@/utils/mangaImageHeaders';

jest.unmock('@/services/chapterStorageService');

const mockFileStore = new Map<
  string,
  { exists: boolean; size: number; content?: string }
>();
const mockDirStore = new Set<string>();
const mockDownloadFileAsync = jest.fn();

jest.mock('expo-file-system', () => {
  const mockNormalizePath = (parts: any[]): string =>
    parts
      .map((part) => {
        if (part == null) return '';
        if (typeof part === 'string') return part;
        if (typeof part.path === 'string') return part.path;
        if (typeof part.uri === 'string') {
          return part.uri.replace(/^file:\/\//, '');
        }
        return String(part);
      })
      .filter(Boolean)
      .join('/');

  function MockFile(...args: any[]) {
    // @ts-expect-error constructor function mock
    const self = this as any;
    self.path = mockNormalizePath(args);
    self.uri = `file://${self.path}`;
    Object.defineProperty(self, 'exists', {
      get: () => mockFileStore.get(self.path)?.exists === true,
    });
    self.info = () => {
      const entry = mockFileStore.get(self.path);
      return {
        exists: entry?.exists === true,
        size: entry?.size ?? 0,
        uri: self.uri,
      };
    };
    self.delete = () => {
      mockFileStore.delete(self.path);
    };
    self.write = async (content: string) => {
      mockFileStore.set(self.path, {
        exists: true,
        size: content.length,
        content,
      });
    };
  }

  (MockFile as any).downloadFileAsync = (...args: any[]) =>
    mockDownloadFileAsync(...args);

  function MockDirectory(...args: any[]) {
    // @ts-expect-error constructor function mock
    const self = this as any;
    self.path = mockNormalizePath(args);
    self.uri = `file://${self.path}`;
    self.name = String(args[args.length - 1] ?? '');
    if (args[0] && typeof args[0] === 'object' && args[0].path) {
      self.parentDirectory = args[0];
    }
    Object.defineProperty(self, 'exists', {
      get: () => mockDirStore.has(self.path),
    });
    self.create = async () => {
      mockDirStore.add(self.path);
    };
    self.delete = () => {
      mockDirStore.delete(self.path);
      for (const key of Array.from(mockFileStore.keys())) {
        if (key.startsWith(self.path)) {
          mockFileStore.delete(key);
        }
      }
    };
    self.list = () => {
      const prefix = `${self.path}/`;
      const names = new Set<string>();

      for (const dirPath of mockDirStore) {
        if (dirPath.startsWith(prefix)) {
          const rest = dirPath.slice(prefix.length);
          const name = rest.split('/')[0];
          if (name) names.add(name);
        }
      }

      for (const filePath of mockFileStore.keys()) {
        if (filePath.startsWith(prefix)) {
          const rest = filePath.slice(prefix.length);
          const name = rest.split('/')[0];
          if (name) names.add(name);
        }
      }

      return Array.from(names).map((name) => ({
        name,
        uri: `${self.uri}/${name}`,
      }));
    };
  }

  return {
    File: MockFile,
    Directory: MockDirectory,
    Paths: {
      cache: 'mock-cache',
      document: 'mock-docs',
      availableDiskSpace: 10 * 1024 * 1024 * 1024,
      totalDiskSpace: 64 * 1024 * 1024 * 1024,
    },
  };
});

jest.mock('expo-modules-core', () => ({
  requireOptionalNativeModule: jest.fn(() => null),
}));

jest.mock('@/constants/env', () => ({
  isDebugEnabled: jest.fn(() => false),
}));

jest.mock('@/utils/logger', () => ({
  logger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import { chapterStorageService } from '../chapterStorageService';

describe('chapterStorageService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    mockFileStore.clear();
    mockDirStore.clear();
    await AsyncStorage.clear();

    // Reset singleton init state between tests
    (chapterStorageService as any).initialized = false;
    (chapterStorageService as any).metadataLoaded = false;
    (chapterStorageService as any).metadata = {};
    (chapterStorageService as any).settings = null;
    (chapterStorageService as any).usageStats = null;

    mockDownloadFileAsync.mockImplementation(
      async (url: string, destFile: any) => {
        mockFileStore.set(destFile.path, {
          exists: true,
          size: 2048,
          content: `bytes-from:${url}`,
        });
        return destFile;
      }
    );
  });

  it('downloads chapter images with MangaFire CDN headers', async () => {
    const images = [
      {
        pageNumber: 1,
        originalUrl: 'https://mfcdn.example/page1.jpg',
        downloadStatus: ImageDownloadStatus.PENDING,
      },
      {
        pageNumber: 2,
        originalUrl: 'https://mfcdn.example/page2.jpg',
        downloadStatus: ImageDownloadStatus.PENDING,
      },
    ];

    await chapterStorageService.saveChapterImages('manga-1', '12', images);

    expect(mockDownloadFileAsync).toHaveBeenCalledTimes(2);
    expect(mockDownloadFileAsync).toHaveBeenCalledWith(
      'https://mfcdn.example/page1.jpg',
      expect.objectContaining({
        path: expect.stringContaining('page_001.jpg'),
      }),
      { headers: MANGA_IMAGE_REQUEST_HEADERS }
    );

    const downloaded = await chapterStorageService.isChapterDownloaded(
      'manga-1',
      '12'
    );
    expect(downloaded).toBe(true);

    const saved = await chapterStorageService.getChapterImages('manga-1', '12');
    expect(saved).toHaveLength(2);
    expect(saved?.[0]?.localPath).toContain('page_001.jpg');
  });

  it('fails the chapter save when too many image downloads fail', async () => {
    mockDownloadFileAsync.mockRejectedValue(new Error('HTTP 403'));

    await expect(
      chapterStorageService.saveChapterImages('manga-1', '3', [
        {
          pageNumber: 1,
          originalUrl: 'https://mfcdn.example/page1.jpg',
          downloadStatus: ImageDownloadStatus.PENDING,
        },
        {
          pageNumber: 2,
          originalUrl: 'https://mfcdn.example/page2.jpg',
          downloadStatus: ImageDownloadStatus.PENDING,
        },
      ])
    ).rejects.toThrow(/Failed to save enough chapter images/);

    expect(
      await chapterStorageService.isChapterDownloaded('manga-1', '3')
    ).toBe(false);
  });

  it('treats metadata-only chapters without files as not downloaded', async () => {
    (chapterStorageService as any).initialized = true;
    (chapterStorageService as any).metadataLoaded = true;
    (chapterStorageService as any).metadata = {
      'manga-1': {
        '9': {
          mangaId: 'manga-1',
          chapterNumber: '9',
          downloadedAt: Date.now(),
          totalImages: 10,
          totalSize: 1000,
          version: '1.0',
        },
      },
    };

    expect(
      await chapterStorageService.isChapterDownloaded('manga-1', '9')
    ).toBe(false);
  });

  it('downloadAndSaveImage writes a page file with headers', async () => {
    const saved = await chapterStorageService.downloadAndSaveImage(
      'manga-1',
      '5',
      {
        pageNumber: 1,
        originalUrl: 'https://mfcdn.example/page1.jpg',
        downloadStatus: ImageDownloadStatus.PENDING,
      }
    );

    expect(saved.localPath).toContain('page_001.jpg');
    expect(saved.fileSize).toBe(2048);
    expect(saved.downloadStatus).toBe(ImageDownloadStatus.COMPLETED);
    expect(mockDownloadFileAsync).toHaveBeenCalledWith(
      'https://mfcdn.example/page1.jpg',
      expect.any(Object),
      { headers: MANGA_IMAGE_REQUEST_HEADERS }
    );
  });
});
