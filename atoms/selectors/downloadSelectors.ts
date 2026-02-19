import { useMemo } from 'react';
import { useAtomValue } from '@zedux/react';
import { downloadManagerAtom } from '@/atoms/downloadManagerAtom';
import { downloadQueueAtom } from '@/atoms/downloadQueueAtom';
import { DownloadProgressInfo } from '@/types/atoms';
import { QueueStatus } from '@/types/download';

/**
 * Selector: returns the download progress for a specific download ID.
 * Returns undefined if the download is not active.
 */
export const useDownloadProgress = (
  downloadId: string
): DownloadProgressInfo | undefined => {
  const state = useAtomValue(downloadManagerAtom);
  return state.activeDownloads.get(downloadId);
};

/**
 * Selector: returns all active downloads as an array.
 * Memoized to avoid creating a new array reference on every render.
 */
export const useActiveDownloads = (): DownloadProgressInfo[] => {
  const state = useAtomValue(downloadManagerAtom);
  return useMemo(
    () => Array.from(state.activeDownloads.values()),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.activeDownloads]
  );
};

/**
 * Selector: returns the current queue status summary.
 * Memoized to avoid creating a new object reference on every render.
 */
export const useQueueStatus = (): QueueStatus => {
  const state = useAtomValue(downloadQueueAtom);
  return useMemo(
    () => ({
      totalItems: state.queue.length + state.activeDownloadIds.size,
      activeDownloads: state.activeDownloadIds.size,
      queuedItems: state.queue.length,
      isPaused: state.isPaused,
      isProcessing: state.isProcessing,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      state.queue.length,
      state.activeDownloadIds.size,
      state.isPaused,
      state.isProcessing,
    ]
  );
};
