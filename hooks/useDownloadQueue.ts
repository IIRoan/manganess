import { useAtomValue, useAtomInstance } from '@zedux/react';
import { downloadQueueAtom } from '@/atoms/downloadQueueAtom';
import { DownloadQueueItem, QueueStatus } from '@/types/download';

/**
 * Hook to access the download queue state and control functions.
 */
export const useDownloadQueue = () => {
  const state = useAtomValue(downloadQueueAtom);
  const instance = useAtomInstance(downloadQueueAtom);

  const queueStatus: QueueStatus = {
    totalItems: state.queue.length + state.activeDownloadIds.size,
    activeDownloads: state.activeDownloadIds.size,
    queuedItems: state.queue.length,
    isPaused: state.isPaused,
    isProcessing: state.isProcessing,
  };

  return {
    queue: state.queue,
    activeDownloadIds: state.activeDownloadIds,
    isPaused: state.isPaused,
    isProcessing: state.isProcessing,
    queueStatus,
    queueDownload: (item: DownloadQueueItem) =>
      instance.exports.queueDownload(item),
    removeFromQueue: (mangaId: string, chapterNumber: string) =>
      instance.exports.removeFromQueue(mangaId, chapterNumber),
    clearQueue: () => instance.exports.clearQueue(),
    pauseQueue: () => instance.exports.pauseQueue(),
    resumeQueue: () => instance.exports.resumeQueue(),
    isInQueue: (mangaId: string, chapterNumber: string) =>
      instance.exports.isInQueue(mangaId, chapterNumber),
  };
};
