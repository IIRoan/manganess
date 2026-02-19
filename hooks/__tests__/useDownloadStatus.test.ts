import { renderHook, act, waitFor } from '@testing-library/react-native';
import { DownloadStatus } from '@/types/download';

const mockLoggerInstance = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Mock dependencies
jest.mock('@/utils/logger', () => ({
  logger: () => mockLoggerInstance,
}));

// Mock atom values
const mockDmState = {
  activeDownloads: new Map(),
  pausedDownloads: new Map(),
  downloadContexts: new Map(),
};

const mockQueueState = {
  queue: [] as any[],
  activeDownloadIds: new Set<string>(),
  isPaused: false,
  isProcessing: false,
};

jest.mock('@zedux/react', () => ({
  useAtomValue: jest.fn((atomRef: any) => {
    if (
      atomRef === require('@/atoms/downloadManagerAtom').downloadManagerAtom
    ) {
      return mockDmState;
    }
    if (atomRef === require('@/atoms/downloadQueueAtom').downloadQueueAtom) {
      return mockQueueState;
    }
    return {};
  }),
}));

jest.mock('@/atoms/downloadManagerAtom', () => ({
  downloadManagerAtom: { key: 'downloadManager' },
}));

jest.mock('@/atoms/downloadQueueAtom', () => ({
  downloadQueueAtom: { key: 'downloadQueue' },
}));

jest.mock('@/services/chapterStorageService', () => ({
  chapterStorageService: {
    isChapterDownloaded: jest.fn().mockResolvedValue(false),
  },
}));

jest.mock('@/services/downloadManager', () => ({
  downloadManagerService: {
    getDownloadProgress: jest.fn(),
    isDownloadPaused: jest.fn(),
    addProgressListener: jest.fn(),
  },
}));

import {
  useDownloadStatus,
  type UseDownloadStatusOptions,
} from '../useDownloadStatus';
import { chapterStorageService } from '@/services/chapterStorageService';
import { downloadManagerService } from '@/services/downloadManager';

const mockChapterStorage = chapterStorageService as jest.Mocked<
  typeof chapterStorageService
>;
const mockDownloadManager = downloadManagerService as jest.Mocked<
  typeof downloadManagerService
>;

describe('useDownloadStatus', () => {
  const defaultOptions: UseDownloadStatusOptions = {
    mangaId: 'manga-1',
    chapterNumber: '1',
  };

  const waitForInitialLoad = async (result: {
    current: { isLoading: boolean };
  }) => {
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockChapterStorage.isChapterDownloaded.mockResolvedValue(false);
    // Reset mock atom state
    mockDmState.activeDownloads = new Map();
    mockDmState.pausedDownloads = new Map();
    mockDmState.downloadContexts = new Map();
    mockQueueState.queue = [];
    mockQueueState.activeDownloadIds = new Set();
    mockQueueState.isPaused = false;
    mockQueueState.isProcessing = false;
    mockDownloadManager.getDownloadProgress.mockReturnValue(null);
    mockDownloadManager.isDownloadPaused.mockReturnValue(false);
    mockDownloadManager.addProgressListener.mockImplementation(() => () => {});
  });

  it('returns initial queued status', async () => {
    const { result } = renderHook(() => useDownloadStatus(defaultOptions));

    expect(result.current.status).toBe(DownloadStatus.QUEUED);
    expect(result.current.isLoading).toBe(true);
    await waitForInitialLoad(result);
  });

  it('returns downloadId', async () => {
    const { result } = renderHook(() =>
      useDownloadStatus({ mangaId: 'manga-test', chapterNumber: '5' })
    );

    expect(result.current.downloadId).toBe('manga-test_5');
    await waitForInitialLoad(result);
  });

  describe('atom-based status derivation', () => {
    it('returns completed when chapter is downloaded on disk', async () => {
      mockChapterStorage.isChapterDownloaded.mockResolvedValue(true);

      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      expect(result.current.status).toBe(DownloadStatus.COMPLETED);
      expect(result.current.isDownloaded).toBe(true);
      expect(result.current.progress).toBe(100);
    });

    it('returns downloading when in active downloads', async () => {
      mockDmState.activeDownloads.set('manga-1_1', {
        downloadId: 'manga-1_1',
        mangaId: 'manga-1',
        mangaTitle: 'Test',
        chapterNumber: '1',
        totalImages: 10,
        downloadedImages: 5,
        failedImages: 0,
        progress: 50,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        totalBytes: 1000,
        downloadedBytes: 500,
        estimatedTimeRemaining: 30,
        downloadSpeed: 1024,
      });

      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      expect(result.current.status).toBe(DownloadStatus.DOWNLOADING);
      expect(result.current.isDownloading).toBe(true);
      expect(result.current.progress).toBe(50);
      expect(result.current.estimatedTimeRemaining).toBe(30);
      expect(result.current.downloadSpeed).toBe(1024);
    });

    it('returns failed when active download has error', async () => {
      mockDmState.activeDownloads.set('manga-1_1', {
        downloadId: 'manga-1_1',
        mangaId: 'manga-1',
        mangaTitle: 'Test',
        chapterNumber: '1',
        totalImages: 10,
        downloadedImages: 3,
        failedImages: 0,
        progress: 30,
        startTime: Date.now(),
        lastUpdateTime: Date.now(),
        totalBytes: 1000,
        downloadedBytes: 300,
        error: { type: 'NETWORK_ERROR', message: 'Connection lost' },
      });

      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      expect(result.current.status).toBe(DownloadStatus.FAILED);
      expect(result.current.isFailed).toBe(true);
    });

    it('returns paused when in paused downloads', async () => {
      mockDmState.pausedDownloads.set('manga-1_1', {
        context: {
          downloadId: 'manga-1_1',
          mangaId: 'manga-1',
          mangaTitle: 'Test',
          chapterNumber: '1',
          chapterUrl: '/test',
          startTime: Date.now(),
        },
        progress: {
          downloadId: 'manga-1_1',
          mangaId: 'manga-1',
          mangaTitle: 'Test',
          chapterNumber: '1',
          totalImages: 10,
          downloadedImages: 4,
          failedImages: 0,
          progress: 40,
          startTime: Date.now(),
          lastUpdateTime: Date.now(),
          totalBytes: 1000,
          downloadedBytes: 400,
        },
        pausedAt: Date.now(),
        pauseReason: 'manual',
      });

      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      expect(result.current.status).toBe(DownloadStatus.PAUSED);
      expect(result.current.isPaused).toBe(true);
      expect(result.current.progress).toBe(40);
    });

    it('returns queued when in download queue', async () => {
      mockQueueState.queue = [
        { mangaId: 'manga-1', chapterNumber: '1', id: 'manga-1_1' },
      ];

      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      expect(result.current.status).toBe(DownloadStatus.QUEUED);
      expect(result.current.isQueued).toBe(true);
    });

    it('returns downloading when in active download ids', async () => {
      mockQueueState.activeDownloadIds = new Set(['manga-1_1']);

      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      expect(result.current.status).toBe(DownloadStatus.DOWNLOADING);
      expect(result.current.isDownloading).toBe(true);
    });

    it('falls back to service progress when atom state is empty', async () => {
      mockDownloadManager.getDownloadProgress.mockReturnValue({
        status: DownloadStatus.DOWNLOADING,
        progress: 42,
        estimatedTimeRemaining: 12,
        downloadSpeed: 500,
      });

      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      expect(result.current.status).toBe(DownloadStatus.DOWNLOADING);
      expect(result.current.isDownloading).toBe(true);
      expect(result.current.progress).toBe(42);
      expect(result.current.estimatedTimeRemaining).toBe(12);
      expect(result.current.downloadSpeed).toBe(500);
    });

    it('falls back to service paused state when atom state is empty', async () => {
      mockDownloadManager.isDownloadPaused.mockReturnValue(true);

      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      expect(result.current.status).toBe(DownloadStatus.PAUSED);
      expect(result.current.isPaused).toBe(true);
    });
  });

  it('handles storage errors gracefully', async () => {
    mockChapterStorage.isChapterDownloaded.mockRejectedValue(
      new Error('Storage error')
    );

    const { result } = renderHook(() => useDownloadStatus(defaultOptions));

    await waitForInitialLoad(result);

    // Should still render without crashing, isLoading should be false
    expect(result.current.isLoading).toBe(false);
    expect(mockLoggerInstance.error).toHaveBeenCalled();
  });

  describe('refresh functionality', () => {
    it('provides a refresh function that re-checks storage', async () => {
      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      // Simulate download completion
      mockChapterStorage.isChapterDownloaded.mockResolvedValue(true);

      await act(async () => {
        result.current.refresh();
      });

      await waitFor(() => {
        expect(result.current.isDownloaded).toBe(true);
      });
    });
  });

  it('cleans up on unmount', async () => {
    const { unmount, result } = renderHook(() =>
      useDownloadStatus(defaultOptions)
    );

    await waitForInitialLoad(result);

    // Should not throw on unmount
    unmount();
  });
});
