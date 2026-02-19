import { useAtomValue, useAtomInstance } from '@zedux/react';
import { downloadManagerAtom } from '@/atoms/downloadManagerAtom';
import { DownloadProgressInfo } from '@/types/atoms';

/**
 * Hook to access download progress for a specific download.
 * Returns the progress info and control functions.
 */
export const useDownloadProgressAtom = (downloadId: string) => {
  const state = useAtomValue(downloadManagerAtom);
  const instance = useAtomInstance(downloadManagerAtom);

  const progress: DownloadProgressInfo | undefined =
    state.activeDownloads.get(downloadId);

  const pausedInfo = state.pausedDownloads.get(downloadId);

  return {
    progress,
    pausedInfo,
    isActive: state.activeDownloads.has(downloadId),
    isPaused: state.pausedDownloads.has(downloadId),
    pauseDownload: (reason?: 'manual' | 'error' | 'app_state') =>
      instance.exports.pauseDownload(downloadId, reason),
    resumeDownload: () => instance.exports.resumeDownload(downloadId),
  };
};
