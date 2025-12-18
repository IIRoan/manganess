import { DownloadStatus } from '@/types/download';

// Mock dependencies
jest.mock('@/utils/logger', () => ({
  logger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('@/utils/downloadEventEmitter', () => {
  const listeners = new Map<string, Set<Function>>();
  let globalListener: Function | null = null;

  return {
    downloadEventEmitter: {
      subscribeGlobal: jest.fn((callback: Function) => {
        globalListener = callback;
        return () => {
          globalListener = null;
        };
      }),
      subscribe: jest.fn((mangaId: string, chapterNumber: string, callback: Function) => {
        const key = `${mangaId}_${chapterNumber}`;
        if (!listeners.has(key)) {
          listeners.set(key, new Set());
        }
        listeners.get(key)?.add(callback);
        return () => {
          listeners.get(key)?.delete(callback);
        };
      }),
      // Helper for tests to trigger events
      _triggerGlobal: (event: any) => {
        if (globalListener) globalListener(event);
      },
    },
  };
});

jest.mock('../downloadManager', () => ({
  downloadManagerService: {
    getDownloadProgress: jest.fn(),
    getActiveDownloads: jest.fn().mockResolvedValue([]),
    addProgressListener: jest.fn().mockReturnValue(() => {}),
  },
}));

jest.mock('../downloadQueue', () => ({
  downloadQueueService: {
    getDownloadById: jest.fn().mockResolvedValue(null),
    getQueuedItems: jest.fn().mockResolvedValue([]),
  },
}));

import { downloadStatusService } from '../downloadStatusService';
import { chapterStorageService } from '../chapterStorageService';
import { downloadManagerService } from '../downloadManager';
import { downloadQueueService } from '../downloadQueue';

const mockChapterStorage = chapterStorageService as jest.Mocked<
  typeof chapterStorageService
>;
const mockDownloadManager = downloadManagerService as jest.Mocked<
  typeof downloadManagerService
>;
const mockDownloadQueue = downloadQueueService as jest.Mocked<
  typeof downloadQueueService
>;

describe('downloadStatusService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    downloadStatusService.clearCacheForChapter();

    mockChapterStorage.isChapterDownloaded.mockResolvedValue(false);
    mockDownloadManager.getActiveDownloads.mockResolvedValue([]);
    mockDownloadManager.getDownloadProgress.mockReturnValue(null);
    mockDownloadQueue.getDownloadById.mockResolvedValue(null);
  });

  describe('getChapterDownloadStatus', () => {
    it('returns completed status for downloaded chapters', async () => {
      mockChapterStorage.isChapterDownloaded.mockResolvedValue(true);

      const status = await downloadStatusService.getChapterDownloadStatus(
        'manga-1',
        '1'
      );

      expect(status).toEqual({
        mangaId: 'manga-1',
        chapterNumber: '1',
        status: DownloadStatus.COMPLETED,
        isDownloaded: true,
        isDownloading: false,
        isQueued: false,
        isFailed: false,
        isPaused: false,
        progress: 100,
      });
    });

    it('returns queued status when in download queue', async () => {
      mockDownloadQueue.getDownloadById.mockResolvedValue({
        id: 'manga-1_1',
        mangaId: 'manga-1',
        chapterNumber: '1',
        status: DownloadStatus.QUEUED,
        progress: 0,
      } as any);

      const status = await downloadStatusService.getChapterDownloadStatus(
        'manga-1',
        '1'
      );

      expect(status.status).toBe(DownloadStatus.QUEUED);
      expect(status.isQueued).toBe(true);
      expect(status.isDownloading).toBe(false);
    });

    it('returns downloading status with progress', async () => {
      mockDownloadQueue.getDownloadById.mockResolvedValue({
        id: 'manga-1_1',
        status: DownloadStatus.DOWNLOADING,
      } as any);

      mockDownloadManager.getDownloadProgress.mockReturnValue({
        status: DownloadStatus.DOWNLOADING,
        progress: 50,
        estimatedTimeRemaining: 30,
        downloadSpeed: 1024,
      });

      const status = await downloadStatusService.getChapterDownloadStatus(
        'manga-1',
        '1'
      );

      expect(status.status).toBe(DownloadStatus.DOWNLOADING);
      expect(status.isDownloading).toBe(true);
      expect(status.progress).toBe(50);
      expect(status.estimatedTimeRemaining).toBe(30);
      expect(status.downloadSpeed).toBe(1024);
    });

    it('returns failed status on error', async () => {
      mockChapterStorage.isChapterDownloaded.mockRejectedValue(
        new Error('Storage error')
      );

      const status = await downloadStatusService.getChapterDownloadStatus(
        'manga-1',
        '1'
      );

      expect(status.status).toBe(DownloadStatus.FAILED);
      expect(status.isFailed).toBe(true);
    });

    it('checks active downloads when not in queue', async () => {
      mockDownloadManager.getActiveDownloads.mockResolvedValue([
        {
          id: 'manga-1_1',
          mangaId: 'manga-1',
          chapterNumber: '1',
          status: DownloadStatus.DOWNLOADING,
        } as any,
      ]);

      mockDownloadManager.getDownloadProgress.mockReturnValue({
        status: DownloadStatus.DOWNLOADING,
        progress: 75,
      });

      const status = await downloadStatusService.getChapterDownloadStatus(
        'manga-1',
        '1'
      );

      expect(status.status).toBe(DownloadStatus.DOWNLOADING);
      expect(status.progress).toBe(75);
    });

    it('caches status results', async () => {
      mockChapterStorage.isChapterDownloaded.mockResolvedValue(true);

      // First call
      await downloadStatusService.getChapterDownloadStatus('manga-1', '1');
      // Second call should use cache
      await downloadStatusService.getChapterDownloadStatus('manga-1', '1');

      expect(mockChapterStorage.isChapterDownloaded).toHaveBeenCalledTimes(1);
    });
  });

  describe('getBatchDownloadStatus', () => {
    it('returns status for multiple chapters', async () => {
      mockChapterStorage.isChapterDownloaded
        .mockResolvedValueOnce(true) // manga-1, ch1 - downloaded
        .mockResolvedValueOnce(false); // manga-1, ch2 - not downloaded

      mockDownloadQueue.getDownloadById
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'manga-1_2',
          status: DownloadStatus.QUEUED,
        } as any);

      const result = await downloadStatusService.getBatchDownloadStatus({
        items: [
          { mangaId: 'manga-1', chapterNumber: '1' },
          { mangaId: 'manga-1', chapterNumber: '2' },
        ],
      });

      expect(result.statuses).toHaveLength(2);
      expect(result.summary.downloaded).toBe(1);
      expect(result.summary.queued).toBe(1);
      expect(result.summary.total).toBe(2);
    });

    it('handles errors in batch gracefully', async () => {
      mockChapterStorage.isChapterDownloaded
        .mockResolvedValueOnce(true)
        .mockRejectedValueOnce(new Error('Error'));

      const result = await downloadStatusService.getBatchDownloadStatus({
        items: [
          { mangaId: 'manga-1', chapterNumber: '1' },
          { mangaId: 'manga-1', chapterNumber: '2' },
        ],
      });

      expect(result.statuses).toHaveLength(2);
      expect(result.summary.downloaded).toBe(1);
      expect(result.summary.failed).toBe(1);
    });
  });

  describe('getDownloadedChapters', () => {
    it('returns downloaded chapters from storage', async () => {
      mockChapterStorage.getDownloadedChapters.mockResolvedValue(['1', '2', '3']);

      const chapters = await downloadStatusService.getDownloadedChapters('manga-1');

      expect(chapters).toEqual(['1', '2', '3']);
      expect(mockChapterStorage.getDownloadedChapters).toHaveBeenCalledWith(
        'manga-1'
      );
    });

    it('returns empty array on error', async () => {
      mockChapterStorage.getDownloadedChapters.mockRejectedValue(
        new Error('Error')
      );

      const chapters = await downloadStatusService.getDownloadedChapters('manga-1');

      expect(chapters).toEqual([]);
    });
  });

  describe('isDownloadingChapters', () => {
    it('returns true when chapters are downloading', async () => {
      mockDownloadManager.getActiveDownloads.mockResolvedValue([
        { mangaId: 'manga-1', chapterNumber: '1' } as any,
      ]);

      const result = await downloadStatusService.isDownloadingChapters('manga-1');

      expect(result).toBe(true);
    });

    it('returns false when no chapters downloading', async () => {
      mockDownloadManager.getActiveDownloads.mockResolvedValue([]);

      const result = await downloadStatusService.isDownloadingChapters('manga-1');

      expect(result).toBe(false);
    });
  });

  describe('subscribeToProgress', () => {
    it('subscribes to download manager progress', () => {
      const callback = jest.fn();

      downloadStatusService.subscribeToProgress('manga-1', '1', callback);

      expect(mockDownloadManager.addProgressListener).toHaveBeenCalledWith(
        'manga-1_1',
        callback
      );
    });
  });

  describe('refreshStatus', () => {
    it('clears cache and returns fresh status', async () => {
      mockChapterStorage.isChapterDownloaded.mockResolvedValue(true);

      // First call
      await downloadStatusService.getChapterDownloadStatus('manga-1', '1');
      expect(mockChapterStorage.isChapterDownloaded).toHaveBeenCalledTimes(1);

      // Refresh should clear cache and call again
      await downloadStatusService.refreshStatus('manga-1', '1');
      expect(mockChapterStorage.isChapterDownloaded).toHaveBeenCalledTimes(2);
    });
  });

  describe('isChapterDownloaded', () => {
    it('returns true for downloaded chapters', async () => {
      mockChapterStorage.isChapterDownloaded.mockResolvedValue(true);

      const result = await downloadStatusService.isChapterDownloaded('manga-1', '1');

      expect(result).toBe(true);
    });

    it('returns false for non-downloaded chapters', async () => {
      mockChapterStorage.isChapterDownloaded.mockResolvedValue(false);

      const result = await downloadStatusService.isChapterDownloaded('manga-1', '1');

      expect(result).toBe(false);
    });
  });

  describe('isChapterDownloading', () => {
    it('returns true when chapter is downloading', async () => {
      mockDownloadQueue.getDownloadById.mockResolvedValue({
        id: 'manga-1_1',
        status: DownloadStatus.DOWNLOADING,
      } as any);

      const result = await downloadStatusService.isChapterDownloading('manga-1', '1');

      expect(result).toBe(true);
    });

    it('returns false when chapter is not downloading', async () => {
      mockDownloadQueue.getDownloadById.mockResolvedValue(null);

      const result = await downloadStatusService.isChapterDownloading('manga-1', '1');

      expect(result).toBe(false);
    });
  });
});
