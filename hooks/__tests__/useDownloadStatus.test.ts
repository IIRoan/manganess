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

const mockSubscribers = new Map<string, Set<Function>>();

jest.mock('@/utils/downloadEventEmitter', () => ({
  downloadEventEmitter: {
    subscribe: jest.fn(
      (mangaId: string, chapterNumber: string, callback: Function) => {
        const key = `${mangaId}_${chapterNumber}`;
        if (!mockSubscribers.has(key)) {
          mockSubscribers.set(key, new Set());
        }
        mockSubscribers.get(key)?.add(callback);
        return () => {
          mockSubscribers.get(key)?.delete(callback);
        };
      }
    ),
  },
}));

// Helper to trigger events
const triggerEvent = (mangaId: string, chapterNumber: string, event: any) => {
  const key = `${mangaId}_${chapterNumber}`;
  mockSubscribers.get(key)?.forEach((cb) => cb(event));
};

jest.mock('@/services/downloadManager', () => ({
  downloadManagerService: {
    getDownloadProgress: jest.fn().mockReturnValue(null),
    getActiveDownloads: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('@/services/downloadQueue', () => ({
  downloadQueueService: {
    getDownloadById: jest.fn().mockResolvedValue(null),
  },
}));

import {
  useDownloadStatus,
  type UseDownloadStatusOptions,
} from '../useDownloadStatus';
import { chapterStorageService } from '@/services/chapterStorageService';
import { downloadManagerService } from '@/services/downloadManager';
import { downloadQueueService } from '@/services/downloadQueue';
import { downloadEventEmitter } from '@/utils/downloadEventEmitter';

const mockChapterStorage = chapterStorageService as jest.Mocked<
  typeof chapterStorageService
>;
const mockDownloadManager = downloadManagerService as jest.Mocked<
  typeof downloadManagerService
>;
const mockDownloadQueue = downloadQueueService as jest.Mocked<
  typeof downloadQueueService
>;

describe('useDownloadStatus', () => {
  const defaultOptions = {
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
    mockSubscribers.clear();
    mockChapterStorage.isChapterDownloaded.mockResolvedValue(false);
    mockDownloadManager.getActiveDownloads.mockResolvedValue([]);
    mockDownloadManager.getDownloadProgress.mockReturnValue(null);
    mockDownloadQueue.getDownloadById.mockResolvedValue(null);
  });

  it('returns initial queued status', async () => {
    const { result } = renderHook(() => useDownloadStatus(defaultOptions));

    expect(result.current.status).toBe(DownloadStatus.QUEUED);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isQueued).toBe(true);
    await waitForInitialLoad(result);
  });

  it('returns downloadId', async () => {
    const { result } = renderHook(() =>
      useDownloadStatus({ mangaId: 'manga-test', chapterNumber: '5' })
    );

    expect(result.current.downloadId).toBe('manga-test_5');
    await waitForInitialLoad(result);
  });

  it('subscribes to download events', async () => {
    const { result } = renderHook(() => useDownloadStatus(defaultOptions));

    await waitFor(() => {
      expect(downloadEventEmitter.subscribe).toHaveBeenCalledWith(
        'manga-1',
        '1',
        expect.any(Function)
      );
    });
    await waitForInitialLoad(result);
  });

  describe('event handling', () => {
    it('updates on download_started event', async () => {
      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      await act(async () => {
        triggerEvent('manga-1', '1', {
          type: 'download_started',
          mangaId: 'manga-1',
          chapterNumber: '1',
          progress: 0,
        });
      });

      expect(result.current.status).toBe(DownloadStatus.DOWNLOADING);
      expect(result.current.isDownloading).toBe(true);
    });

    it('updates on download_progress event', async () => {
      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      await act(async () => {
        triggerEvent('manga-1', '1', {
          type: 'download_progress',
          mangaId: 'manga-1',
          chapterNumber: '1',
          progress: 75,
          estimatedTimeRemaining: 15,
          downloadSpeed: 2048,
        });
      });

      expect(result.current.status).toBe(DownloadStatus.DOWNLOADING);
      expect(result.current.progress).toBe(75);
    });

    it('updates on download_completed event', async () => {
      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      await act(async () => {
        triggerEvent('manga-1', '1', {
          type: 'download_completed',
          mangaId: 'manga-1',
          chapterNumber: '1',
        });
      });

      expect(result.current.status).toBe(DownloadStatus.COMPLETED);
      expect(result.current.isDownloaded).toBe(true);
      expect(result.current.progress).toBe(100);
    });

    it('updates on download_failed event', async () => {
      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      await act(async () => {
        triggerEvent('manga-1', '1', {
          type: 'download_failed',
          mangaId: 'manga-1',
          chapterNumber: '1',
        });
      });

      expect(result.current.status).toBe(DownloadStatus.FAILED);
      expect(result.current.isFailed).toBe(true);
    });

    it('updates on download_paused event', async () => {
      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      await act(async () => {
        triggerEvent('manga-1', '1', {
          type: 'download_paused',
          mangaId: 'manga-1',
          chapterNumber: '1',
          progress: 50,
        });
      });

      expect(result.current.status).toBe(DownloadStatus.PAUSED);
      expect(result.current.isPaused).toBe(true);
    });

    it('updates on download_deleted event', async () => {
      const { result } = renderHook(() => useDownloadStatus(defaultOptions));

      await waitForInitialLoad(result);

      await act(async () => {
        triggerEvent('manga-1', '1', {
          type: 'download_deleted',
          mangaId: 'manga-1',
          chapterNumber: '1',
        });
      });

      expect(result.current.status).toBe(DownloadStatus.QUEUED);
      expect(result.current.isDownloaded).toBe(false);
    });
  });

  it('cleans up listeners on unmount', async () => {
    const { unmount, result } = renderHook(() =>
      useDownloadStatus(defaultOptions)
    );

    await waitForInitialLoad(result);

    // Should not throw on unmount
    unmount();
  });

  it('re-subscribes when mangaId changes', async () => {
    const { rerender } = renderHook<
      ReturnType<typeof useDownloadStatus>,
      UseDownloadStatusOptions
    >((props) => useDownloadStatus(props), {
      initialProps: { mangaId: 'manga-1', chapterNumber: '1' },
    });

    await waitFor(() => {
      expect(downloadEventEmitter.subscribe).toHaveBeenCalledWith(
        'manga-1',
        '1',
        expect.any(Function)
      );
    });

    (downloadEventEmitter.subscribe as jest.Mock).mockClear();

    rerender({ mangaId: 'manga-2', chapterNumber: '1' });

    await waitFor(() => {
      expect(downloadEventEmitter.subscribe).toHaveBeenCalledWith(
        'manga-2',
        '1',
        expect.any(Function)
      );
    });
  });
});
