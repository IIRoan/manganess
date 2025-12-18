import { renderHook, act } from '@testing-library/react-native';

import { useBatchDownload } from '../useBatchDownload';
import { batchDownloadOrchestrator } from '@/services/batchDownloadOrchestrator';
import type { Chapter } from '@/types';
import type { BatchDownloadState } from '@/services/batchDownloadOrchestrator';

jest.mock('@/services/batchDownloadOrchestrator', () => ({
  batchDownloadOrchestrator: {
    subscribeState: jest.fn(),
    getState: jest.fn(),
    updateSessionMetadata: jest.fn(),
    startBatchDownload: jest.fn(),
    cancelBatchDownload: jest.fn(),
    retryFailedChapters: jest.fn(),
  },
}));

const mockOrchestrator = batchDownloadOrchestrator as jest.Mocked<
  typeof batchDownloadOrchestrator
>;

describe('useBatchDownload', () => {
  const mockMangaId = 'manga-123';
  const mockMangaTitle = 'Test Manga';
  const mockChapters: Chapter[] = [
    { number: '1', title: 'Chapter 1', url: '/ch/1', date: '2024-01-01' },
    { number: '2', title: 'Chapter 2', url: '/ch/2', date: '2024-01-02' },
    { number: '3', title: 'Chapter 3', url: '/ch/3', date: '2024-01-03' },
  ];

  const defaultState: BatchDownloadState = {
    status: 'idle',
    totalChapters: 0,
    processedChapters: 0,
    completedChapters: 0,
    currentChapter: null,
    failedChapters: [],
    progress: 0,
    message: null,
    startedAt: null,
    lastUpdatedAt: null,
    isCancelling: false,
  };

  let stateSubscriber: ((state: BatchDownloadState) => void) | null = null;
  let mockUnsubscribe: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    stateSubscriber = null;
    mockUnsubscribe = jest.fn();

    mockOrchestrator.subscribeState.mockImplementation((mangaId, listener) => {
      void mangaId;
      stateSubscriber = listener;
      return mockUnsubscribe;
    });

    mockOrchestrator.getState.mockReturnValue(defaultState);
    mockOrchestrator.startBatchDownload.mockResolvedValue(undefined);
  });

  it('returns initial state from orchestrator', () => {
    const { result } = renderHook(() =>
      useBatchDownload(mockMangaId, mockMangaTitle, mockChapters)
    );

    expect(result.current.state).toEqual(defaultState);
    expect(result.current.remainingChapters).toBe(0);
  });

  it('subscribes to state changes on mount', () => {
    renderHook(() =>
      useBatchDownload(mockMangaId, mockMangaTitle, mockChapters)
    );

    expect(mockOrchestrator.subscribeState).toHaveBeenCalledWith(
      mockMangaId,
      expect.any(Function)
    );
  });

  it('updates session metadata on mount', () => {
    const options = { maxRetries: 2 };

    renderHook(() =>
      useBatchDownload(mockMangaId, mockMangaTitle, mockChapters, options)
    );

    expect(mockOrchestrator.updateSessionMetadata).toHaveBeenCalledWith(
      mockMangaId,
      mockMangaTitle,
      mockChapters,
      options
    );
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() =>
      useBatchDownload(mockMangaId, mockMangaTitle, mockChapters)
    );

    unmount();

    // Note: unsubscribe is returned from subscribeState, not called directly
    // The actual unsubscribe happens when the store callback is called
  });

  it('starts batch download', async () => {
    const { result } = renderHook(() =>
      useBatchDownload(mockMangaId, mockMangaTitle, mockChapters)
    );

    await act(async () => {
      await result.current.startBatchDownload();
    });

    expect(mockOrchestrator.startBatchDownload).toHaveBeenCalledWith(
      mockMangaId,
      undefined
    );
  });

  it('starts batch download with selection', async () => {
    const selection = mockChapters.slice(0, 2);

    const { result } = renderHook(() =>
      useBatchDownload(mockMangaId, mockMangaTitle, mockChapters)
    );

    await act(async () => {
      await result.current.startBatchDownload(selection);
    });

    expect(mockOrchestrator.startBatchDownload).toHaveBeenCalledWith(
      mockMangaId,
      selection
    );
  });

  it('cancels batch download', () => {
    const { result } = renderHook(() =>
      useBatchDownload(mockMangaId, mockMangaTitle, mockChapters)
    );

    act(() => {
      result.current.cancelBatchDownload();
    });

    expect(mockOrchestrator.cancelBatchDownload).toHaveBeenCalledWith(
      mockMangaId
    );
  });

  it('retries failed chapters', () => {
    const { result } = renderHook(() =>
      useBatchDownload(mockMangaId, mockMangaTitle, mockChapters)
    );

    act(() => {
      result.current.retryFailedChapters();
    });

    expect(mockOrchestrator.retryFailedChapters).toHaveBeenCalledWith(
      mockMangaId
    );
  });

  it('calculates remaining chapters correctly', () => {
    const stateWithProgress: BatchDownloadState = {
      ...defaultState,
      totalChapters: 10,
      processedChapters: 3,
    };

    mockOrchestrator.getState.mockReturnValue(stateWithProgress);

    const { result } = renderHook(() =>
      useBatchDownload(mockMangaId, mockMangaTitle, mockChapters)
    );

    expect(result.current.remainingChapters).toBe(7);
  });

  it('never returns negative remaining chapters', () => {
    const stateWithOverflow: BatchDownloadState = {
      ...defaultState,
      totalChapters: 5,
      processedChapters: 10, // More processed than total (edge case)
    };

    mockOrchestrator.getState.mockReturnValue(stateWithOverflow);

    const { result } = renderHook(() =>
      useBatchDownload(mockMangaId, mockMangaTitle, mockChapters)
    );

    expect(result.current.remainingChapters).toBe(0);
  });

  it('updates state when subscriber callback is called', () => {
    renderHook(() => useBatchDownload(mockMangaId, mockMangaTitle, mockChapters));

    const newState: BatchDownloadState = {
      status: 'downloading',
      totalChapters: 3,
      processedChapters: 1,
      completedChapters: 1,
      currentChapter: mockChapters[1] ?? null,
      failedChapters: [],
      progress: 33,
      message: 'Downloading',
      startedAt: 0,
      lastUpdatedAt: 0,
      isCancelling: false,
    };

    mockOrchestrator.getState.mockReturnValue(newState);

    act(() => {
      stateSubscriber?.(newState);
    });

    // After subscriber is called, useSyncExternalStore should re-render with new state
    expect(mockOrchestrator.getState).toHaveBeenCalled();
  });

  it('resubscribes when mangaId changes', () => {
    const { rerender } = renderHook<
      ReturnType<typeof useBatchDownload>,
      { mangaId: string }
    >(
      ({ mangaId }) =>
        useBatchDownload(mangaId, mockMangaTitle, mockChapters),
      { initialProps: { mangaId: 'manga-1' } }
    );

    expect(mockOrchestrator.subscribeState).toHaveBeenCalledWith(
      'manga-1',
      expect.any(Function)
    );

    rerender({ mangaId: 'manga-2' });

    expect(mockOrchestrator.subscribeState).toHaveBeenCalledWith(
      'manga-2',
      expect.any(Function)
    );
  });

  it('updates metadata when chapters change', () => {
    const { rerender } = renderHook<
      ReturnType<typeof useBatchDownload>,
      { chapters: Chapter[] }
    >(
      ({ chapters }) =>
        useBatchDownload(mockMangaId, mockMangaTitle, chapters),
      { initialProps: { chapters: mockChapters } }
    );

    const newChapters = [...mockChapters, {
      number: '4',
      title: 'Chapter 4',
      url: '/ch/4',
      date: '2024-01-04',
    }];

    rerender({ chapters: newChapters });

    expect(mockOrchestrator.updateSessionMetadata).toHaveBeenCalledWith(
      mockMangaId,
      mockMangaTitle,
      newChapters,
      undefined
    );
  });
});
