// Mock dependencies
jest.mock('@/utils/logger', () => ({
  logger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('../downloadQueue', () => ({
  downloadQueueService: {
    addToQueue: jest.fn().mockResolvedValue(undefined),
    removeFromQueue: jest.fn().mockResolvedValue(true),
    getQueuedItems: jest.fn().mockResolvedValue([]),
  },
}));

import { batchDownloadOrchestrator } from '../batchDownloadOrchestrator';
import { chapterStorageService } from '../chapterStorageService';
import { downloadQueueService } from '../downloadQueue';
import type { Chapter } from '@/types';

const mockChapterStorage = chapterStorageService as jest.Mocked<
  typeof chapterStorageService
>;
const mockDownloadQueue = downloadQueueService as jest.Mocked<
  typeof downloadQueueService
>;

describe('batchDownloadOrchestrator', () => {
  const mockMangaId = 'manga-test-123';
  const mockMangaTitle = 'Test Manga';
  const mockChapters: Chapter[] = [
    { number: '1', title: 'Chapter 1', url: '/ch/1', date: '2024-01-01' },
    { number: '2', title: 'Chapter 2', url: '/ch/2', date: '2024-01-02' },
    { number: '3', title: 'Chapter 3', url: '/ch/3', date: '2024-01-03' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockChapterStorage.isChapterDownloaded.mockResolvedValue(false);
  });

  describe('getState', () => {
    it('returns default idle state for new manga', () => {
      const state = batchDownloadOrchestrator.getState('new-manga-id');

      expect(state).toMatchObject({
        status: 'idle',
        totalChapters: 0,
        processedChapters: 0,
        completedChapters: 0,
        failedChapters: [],
        currentChapter: null,
        progress: 0,
        message: null,
      });
    });
  });

  describe('subscribeState', () => {
    it('calls listener immediately with current state', () => {
      const listener = jest.fn();

      batchDownloadOrchestrator.subscribeState('manga-sub-1', listener);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'idle' })
      );
    });

    it('returns unsubscribe function', () => {
      const listener = jest.fn();

      const unsubscribe = batchDownloadOrchestrator.subscribeState(
        'manga-sub-2',
        listener
      );

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  describe('updateSessionMetadata', () => {
    it('updates session metadata', () => {
      batchDownloadOrchestrator.updateSessionMetadata(
        mockMangaId,
        mockMangaTitle,
        mockChapters
      );

      const state = batchDownloadOrchestrator.getState(mockMangaId);
      expect(state.status).toBe('idle');
    });

    it('accepts custom options', () => {
      batchDownloadOrchestrator.updateSessionMetadata(
        mockMangaId,
        mockMangaTitle,
        mockChapters,
        { maxRetries: 5, throttleDelayMs: 1000 }
      );

      const state = batchDownloadOrchestrator.getState(mockMangaId);
      expect(state.status).toBe('idle');
    });
  });

  describe('startBatchDownload', () => {
    it('starts downloading chapters', async () => {
      batchDownloadOrchestrator.updateSessionMetadata(
        mockMangaId,
        mockMangaTitle,
        mockChapters
      );

      const listener = jest.fn();
      batchDownloadOrchestrator.subscribeState(mockMangaId, listener);

      await batchDownloadOrchestrator.startBatchDownload(mockMangaId);

      const finalCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(finalCall.status).toBe('downloading');
      expect(finalCall.totalChapters).toBe(3);
    });

    it('skips already downloaded chapters', async () => {
      mockChapterStorage.isChapterDownloaded
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      batchDownloadOrchestrator.updateSessionMetadata(
        'manga-skip-1',
        mockMangaTitle,
        mockChapters
      );

      await batchDownloadOrchestrator.startBatchDownload('manga-skip-1');

      expect(mockDownloadQueue.addToQueue).toHaveBeenCalledTimes(2);
    });

    it('completes immediately if all chapters already downloaded', async () => {
      mockChapterStorage.isChapterDownloaded.mockResolvedValue(true);

      batchDownloadOrchestrator.updateSessionMetadata(
        'manga-all-done',
        mockMangaTitle,
        mockChapters
      );

      const listener = jest.fn();
      batchDownloadOrchestrator.subscribeState('manga-all-done', listener);

      await batchDownloadOrchestrator.startBatchDownload('manga-all-done');

      const finalCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(finalCall.status).toBe('completed');
      expect(finalCall.message).toContain('already downloaded');
    });

    it('handles empty chapters list', async () => {
      batchDownloadOrchestrator.updateSessionMetadata(
        'manga-empty',
        mockMangaTitle,
        []
      );

      const listener = jest.fn();
      batchDownloadOrchestrator.subscribeState('manga-empty', listener);

      await batchDownloadOrchestrator.startBatchDownload('manga-empty');

      const finalCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(finalCall.status).toBe('completed');
      expect(finalCall.message).toContain('No chapters');
    });

    it('downloads only selected chapters when provided', async () => {
      batchDownloadOrchestrator.updateSessionMetadata(
        'manga-select',
        mockMangaTitle,
        mockChapters
      );

      const selected = mockChapters.slice(0, 2);
      await batchDownloadOrchestrator.startBatchDownload(
        'manga-select',
        selected
      );

      expect(mockDownloadQueue.addToQueue).toHaveBeenCalledTimes(2);
    });
  });

  describe('cancelBatchDownload', () => {
    it('cancels the batch download', async () => {
      batchDownloadOrchestrator.updateSessionMetadata(
        'manga-cancel',
        mockMangaTitle,
        mockChapters
      );

      await batchDownloadOrchestrator.startBatchDownload('manga-cancel');

      const listener = jest.fn();
      batchDownloadOrchestrator.subscribeState('manga-cancel', listener);

      batchDownloadOrchestrator.cancelBatchDownload('manga-cancel');

      const finalCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(finalCall.status).toBe('cancelled');
    });

    it('removes items from download queue', async () => {
      mockDownloadQueue.getQueuedItems.mockResolvedValue([
        { mangaId: 'manga-cancel-2', chapterNumber: '1' },
        { mangaId: 'manga-cancel-2', chapterNumber: '2' },
        { mangaId: 'other-manga', chapterNumber: '1' },
      ] as any);

      batchDownloadOrchestrator.updateSessionMetadata(
        'manga-cancel-2',
        mockMangaTitle,
        mockChapters
      );

      batchDownloadOrchestrator.cancelBatchDownload('manga-cancel-2');

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockDownloadQueue.removeFromQueue).toHaveBeenCalledWith(
        'manga-cancel-2',
        '1'
      );
      expect(mockDownloadQueue.removeFromQueue).toHaveBeenCalledWith(
        'manga-cancel-2',
        '2'
      );
    });
  });

  describe('retryFailedChapters', () => {
    it('re-adds failed chapters to queue', async () => {
      batchDownloadOrchestrator.updateSessionMetadata(
        'manga-retry',
        mockMangaTitle,
        mockChapters
      );

      await batchDownloadOrchestrator.startBatchDownload('manga-retry');

      // Simulate failures via handleDownloadEvent
      batchDownloadOrchestrator.handleDownloadEvent({
        type: 'download_failed',
        mangaId: 'manga-retry',
        chapterNumber: '1',
        error: 'Network error',
      });

      batchDownloadOrchestrator.handleDownloadEvent({
        type: 'download_failed',
        mangaId: 'manga-retry',
        chapterNumber: '2',
        error: 'Timeout',
      });

      mockDownloadQueue.addToQueue.mockClear();

      batchDownloadOrchestrator.retryFailedChapters('manga-retry');

      expect(mockDownloadQueue.addToQueue).toHaveBeenCalledTimes(2);
    });

    it('does nothing if no failed chapters', () => {
      batchDownloadOrchestrator.updateSessionMetadata(
        'manga-no-fail',
        mockMangaTitle,
        mockChapters
      );

      mockDownloadQueue.addToQueue.mockClear();

      batchDownloadOrchestrator.retryFailedChapters('manga-no-fail');

      expect(mockDownloadQueue.addToQueue).not.toHaveBeenCalled();
    });
  });

  describe('event handling via handleDownloadEvent', () => {
    it('updates state on download_completed event', async () => {
      batchDownloadOrchestrator.updateSessionMetadata(
        'manga-events',
        mockMangaTitle,
        mockChapters
      );

      await batchDownloadOrchestrator.startBatchDownload('manga-events');

      const listener = jest.fn();
      batchDownloadOrchestrator.subscribeState('manga-events', listener);

      batchDownloadOrchestrator.handleDownloadEvent({
        type: 'download_completed',
        mangaId: 'manga-events',
        chapterNumber: '1',
      });

      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall.completedChapters).toBeGreaterThanOrEqual(1);
    });

    it('updates state on download_failed event', async () => {
      batchDownloadOrchestrator.updateSessionMetadata(
        'manga-events-fail',
        mockMangaTitle,
        mockChapters
      );

      await batchDownloadOrchestrator.startBatchDownload('manga-events-fail');

      const listener = jest.fn();
      batchDownloadOrchestrator.subscribeState('manga-events-fail', listener);

      batchDownloadOrchestrator.handleDownloadEvent({
        type: 'download_failed',
        mangaId: 'manga-events-fail',
        chapterNumber: '1',
        error: 'Test error',
      });

      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall.failedChapters.length).toBeGreaterThanOrEqual(1);
      expect(lastCall.failedChapters[0].error).toBe('Test error');
    });

    it('ignores events for non-active sessions', async () => {
      batchDownloadOrchestrator.updateSessionMetadata(
        'manga-idle',
        mockMangaTitle,
        mockChapters
      );

      const listener = jest.fn();
      batchDownloadOrchestrator.subscribeState('manga-idle', listener);
      listener.mockClear();

      batchDownloadOrchestrator.handleDownloadEvent({
        type: 'download_completed',
        mangaId: 'manga-idle',
        chapterNumber: '1',
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it('ignores events for unknown manga', () => {
      // Should not throw
      batchDownloadOrchestrator.handleDownloadEvent({
        type: 'download_completed',
        mangaId: 'unknown-manga',
        chapterNumber: '1',
      });
    });

    it('completes batch when all chapters processed', async () => {
      batchDownloadOrchestrator.updateSessionMetadata(
        'manga-complete',
        mockMangaTitle,
        mockChapters.slice(0, 1)
      );

      await batchDownloadOrchestrator.startBatchDownload('manga-complete');

      const listener = jest.fn();
      batchDownloadOrchestrator.subscribeState('manga-complete', listener);

      batchDownloadOrchestrator.handleDownloadEvent({
        type: 'download_completed',
        mangaId: 'manga-complete',
        chapterNumber: '1',
      });

      const lastCall = listener.mock.calls[listener.mock.calls.length - 1][0];
      expect(lastCall.status).toBe('completed');
      expect(lastCall.progress).toBe(100);
    });
  });
});
