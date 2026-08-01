jest.mock('@/utils/logger', () => ({
  logger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('@/constants/env', () => ({
  isDebugEnabled: jest.fn(() => false),
}));

jest.mock('../mangaFireService', () => ({
  loadOnlineChapterImages: jest.fn(),
}));

jest.mock('../imageExtractor', () => ({
  imageExtractorService: {
    extractImagesFromInterceptedRequest: jest.fn(),
  },
}));

jest.mock('../downloadQueue', () => ({
  downloadQueueService: {
    updateDownloadProgress: jest.fn().mockResolvedValue(undefined),
    failDownload: jest.fn().mockResolvedValue(undefined),
    completeDownload: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../downloadValidationService', () => ({
  downloadValidationService: {
    validateChapterIntegrity: jest.fn().mockResolvedValue({
      isValid: true,
      integrityScore: 100,
      recommendedAction: 'none',
      totalImages: 2,
      validImages: 2,
      corruptedImages: 0,
      missingImages: 0,
      totalSize: 2048,
      errors: [],
      warnings: [],
      imageResults: new Map(),
    }),
  },
}));

jest.mock('../downloadErrorHandler', () => ({
  downloadErrorHandler: {
    handleDownloadError: jest.fn().mockResolvedValue({
      shouldRetry: false,
      message: 'failed',
    }),
    handleStorageError: jest.fn().mockResolvedValue({
      shouldRetry: false,
      message: 'storage full',
    }),
  },
}));

jest.mock('../webViewRequestInterceptor', () => ({
  webViewRequestInterceptor: {
    onRequestIntercepted: jest.fn(() => jest.fn()),
    interceptRequest: jest.fn(),
    waitForRequest: jest.fn(),
  },
}));

import { ImageDownloadStatus } from '@/types/download';
import { downloadManagerService } from '../downloadManager';
import { loadOnlineChapterImages } from '../mangaFireService';
import { chapterStorageService } from '../chapterStorageService';
import { webViewRequestInterceptor } from '../webViewRequestInterceptor';

const mockLoadOnlineChapterImages =
  loadOnlineChapterImages as jest.MockedFunction<typeof loadOnlineChapterImages>;

describe('downloadManagerService modern download path', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    (chapterStorageService.isChapterDownloaded as jest.Mock).mockResolvedValue(
      false
    );
    (chapterStorageService.getStorageStats as jest.Mock).mockResolvedValue({
      totalSize: 0,
      totalChapters: 0,
      mangaCount: 0,
      availableSpace: 5 * 1024 * 1024 * 1024,
      oldestDownload: 0,
    });
    (chapterStorageService.downloadAndSaveImage as jest.Mock).mockImplementation(
      async (_mangaId: string, _chapterNumber: string, image: any) => ({
        ...image,
        localPath: `file://downloads/${image.pageNumber}.jpg`,
        fileSize: 2048,
        downloadStatus: ImageDownloadStatus.COMPLETED,
      })
    );
    (chapterStorageService.saveChapterImages as jest.Mock).mockResolvedValue(
      undefined
    );
    (chapterStorageService.getChapterImages as jest.Mock).mockResolvedValue([
      {
        pageNumber: 1,
        originalUrl: 'https://cdn.example/1.jpg',
        localPath: 'file://downloads/1.jpg',
        fileSize: 2048,
        downloadStatus: ImageDownloadStatus.COMPLETED,
      },
      {
        pageNumber: 2,
        originalUrl: 'https://cdn.example/2.jpg',
        localPath: 'file://downloads/2.jpg',
        fileSize: 2048,
        downloadStatus: ImageDownloadStatus.COMPLETED,
      },
    ]);

    mockLoadOnlineChapterImages.mockResolvedValue([
      {
        pageNumber: 1,
        originalUrl: 'https://cdn.example/1.jpg',
        localPath: 'https://cdn.example/1.jpg',
        downloadStatus: ImageDownloadStatus.COMPLETED,
      },
      {
        pageNumber: 2,
        originalUrl: 'https://cdn.example/2.jpg',
        localPath: 'https://cdn.example/2.jpg',
        downloadStatus: ImageDownloadStatus.COMPLETED,
      },
    ]);
  });

  it('downloads a chapter via loadOnlineChapterImages without WebView intercept', async () => {
    const result = await downloadManagerService.downloadChapter(
      'zkz23',
      '40',
      '/chapter/9333700'
    );

    expect(mockLoadOnlineChapterImages).toHaveBeenCalledWith('zkz23', '40');
    expect(webViewRequestInterceptor.onRequestIntercepted).not.toHaveBeenCalled();
    expect(chapterStorageService.downloadAndSaveImage).toHaveBeenCalled();
    expect(chapterStorageService.saveChapterImages).toHaveBeenCalled();
    expect(result.success).toBe(true);
    expect(result.chapterImages?.length).toBeGreaterThan(0);
  });

  it('fails clearly when page resolution fails', async () => {
    mockLoadOnlineChapterImages.mockRejectedValue(
      new Error('Chapter 40 not found')
    );

    const result = await downloadManagerService.downloadChapter(
      'zkz23',
      '40',
      '/chapter/9333700'
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toMatch(/not found|failed|error/i);
    expect(chapterStorageService.downloadAndSaveImage).not.toHaveBeenCalled();
  });
});
