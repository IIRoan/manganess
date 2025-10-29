import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { Chapter } from '@/types';
import {
  batchDownloadOrchestrator,
  type BatchDownloadState,
  type UseBatchDownloadOptions,
} from '@/services/batchDownloadOrchestrator';

export interface UseBatchDownloadReturn {
  state: BatchDownloadState;
  startBatchDownload: (selection?: Chapter[]) => Promise<void>;
  cancelBatchDownload: () => void;
  retryFailedChapters: () => void;
  remainingChapters: number;
}

export const useBatchDownload = (
  mangaId: string,
  mangaTitle: string,
  chapters: Chapter[],
  options?: UseBatchDownloadOptions
): UseBatchDownloadReturn => {
  const subscribe = useCallback(
    (listener: (state: BatchDownloadState) => void) =>
      batchDownloadOrchestrator.subscribeState(mangaId, listener),
    [mangaId]
  );

  const getSnapshot = useCallback(
    () => batchDownloadOrchestrator.getState(mangaId),
    [mangaId]
  );

  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    batchDownloadOrchestrator.updateSessionMetadata(
      mangaId,
      mangaTitle,
      chapters,
      options
    );
  }, [mangaId, mangaTitle, chapters, options]);

  const startBatchDownload = useCallback(
    (selection?: Chapter[]) =>
      batchDownloadOrchestrator.startBatchDownload(mangaId, selection),
    [mangaId]
  );

  const cancelBatchDownload = useCallback(() => {
    batchDownloadOrchestrator.cancelBatchDownload(mangaId);
  }, [mangaId]);

  const retryFailedChapters = useCallback(() => {
    batchDownloadOrchestrator.retryFailedChapters(mangaId);
  }, [mangaId]);

  const remainingChapters = useMemo(
    () => Math.max(state.totalChapters - state.processedChapters, 0),
    [state.processedChapters, state.totalChapters]
  );

  return {
    state,
    startBatchDownload,
    cancelBatchDownload,
    retryFailedChapters,
    remainingChapters,
  };
};
