import { useState, useEffect, useCallback, useRef } from 'react';
import { useAtomValue } from '@zedux/react';
import { downloadManagerAtom } from '@/atoms/downloadManagerAtom';
import { downloadQueueAtom } from '@/atoms/downloadQueueAtom';
import { downloadManagerService } from '@/services/downloadManager';
import { chapterStorageService } from '@/services/chapterStorageService';
import { DownloadStatus, DownloadProgress } from '@/types/download';
import { logger } from '@/utils/logger';

export interface DownloadStatusInfo {
  status: DownloadStatus;
  isDownloaded: boolean;
  isDownloading: boolean;
  isQueued: boolean;
  isFailed: boolean;
  isPaused: boolean;
  progress: number;
  estimatedTimeRemaining?: number | undefined;
  downloadSpeed?: number | undefined;
}

export interface UseDownloadStatusOptions {
  mangaId: string;
  chapterNumber: string;
}

export const useDownloadStatus = ({
  mangaId,
  chapterNumber,
}: UseDownloadStatusOptions) => {
  const log = logger();
  const downloadId = `${mangaId}_${chapterNumber}`;

  // Subscribe to atom state for reactive updates
  const dmState = useAtomValue(downloadManagerAtom);
  const queueState = useAtomValue(downloadQueueAtom);

  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [serviceProgress, setServiceProgress] =
    useState<DownloadProgress | null>(null);
  const mountedRef = useRef(true);

  // Check if chapter is downloaded on disk (async check)
  const checkDownloaded = useCallback(async () => {
    try {
      const downloaded = await chapterStorageService.isChapterDownloaded(
        mangaId,
        chapterNumber
      );
      if (mountedRef.current) {
        setIsDownloaded(downloaded);
        setIsLoading(false);
      }
    } catch (error) {
      log.error('UI', 'Error checking download status', {
        mangaId,
        chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [mangaId, chapterNumber, log]);

  useEffect(() => {
    mountedRef.current = true;
    const timeoutId = setTimeout(() => checkDownloaded(), 100);
    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutId);
    };
  }, [checkDownloaded]);

  const syncServiceStatus = useCallback(() => {
    try {
      const progress = downloadManagerService.getDownloadProgress(downloadId);

      if (mountedRef.current) {
        setServiceProgress((prev) => {
          if (
            prev?.status === progress?.status &&
            prev?.progress === progress?.progress &&
            prev?.estimatedTimeRemaining === progress?.estimatedTimeRemaining &&
            prev?.downloadSpeed === progress?.downloadSpeed
          ) {
            return prev;
          }
          return progress;
        });
      }
    } catch (error) {
      log.warn('Service', 'Failed to sync download manager service status', {
        downloadId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [downloadId, log]);

  useEffect(() => {
    syncServiceStatus();

    const unsubscribe = downloadManagerService.addProgressListener(
      downloadId,
      (progress) => {
        if (!mountedRef.current) return;

        setServiceProgress(progress);

        if (progress.status === DownloadStatus.COMPLETED) {
          checkDownloaded();
        }
      }
    );

    const intervalId = setInterval(syncServiceStatus, 1000);

    return () => {
      unsubscribe();
      clearInterval(intervalId);
    };
  }, [downloadId, checkDownloaded, syncServiceStatus]);

  // Derive status from atom state reactively
  const statusInfo: DownloadStatusInfo = (() => {
    // If downloaded on disk, that takes priority
    if (isDownloaded) {
      return {
        status: DownloadStatus.COMPLETED,
        isDownloaded: true,
        isDownloading: false,
        isQueued: false,
        isFailed: false,
        isPaused: false,
        progress: 100,
      };
    }

    // Check active downloads in the download manager atom
    const activeProgress = dmState.activeDownloads.get(downloadId);
    if (activeProgress) {
      const hasError = !!activeProgress.error;
      return {
        status: hasError ? DownloadStatus.FAILED : DownloadStatus.DOWNLOADING,
        isDownloaded: false,
        isDownloading: !hasError,
        isQueued: false,
        isFailed: hasError,
        isPaused: false,
        progress: activeProgress.progress,
        estimatedTimeRemaining: activeProgress.estimatedTimeRemaining,
        downloadSpeed: activeProgress.downloadSpeed,
      };
    }

    // Check paused downloads
    const pausedInfo = dmState.pausedDownloads.get(downloadId);
    if (pausedInfo) {
      return {
        status: DownloadStatus.PAUSED,
        isDownloaded: false,
        isDownloading: false,
        isQueued: false,
        isFailed: false,
        isPaused: true,
        progress: pausedInfo.progress?.progress ?? 0,
      };
    }

    // Fall back to the legacy download manager service
    if (serviceProgress) {
      const isFailed = serviceProgress.status === DownloadStatus.FAILED;
      const isPaused = serviceProgress.status === DownloadStatus.PAUSED;

      return {
        status: isFailed
          ? DownloadStatus.FAILED
          : isPaused
            ? DownloadStatus.PAUSED
            : DownloadStatus.DOWNLOADING,
        isDownloaded: false,
        isDownloading: !isFailed && !isPaused,
        isQueued: false,
        isFailed,
        isPaused,
        progress: serviceProgress.progress,
        estimatedTimeRemaining: serviceProgress.estimatedTimeRemaining,
        downloadSpeed: serviceProgress.downloadSpeed,
      };
    }

    // Check if in the download queue
    const inQueue = queueState.queue.some(
      (item) => item.mangaId === mangaId && item.chapterNumber === chapterNumber
    );
    const isActive = queueState.activeDownloadIds.has(downloadId);

    if (inQueue || isActive) {
      return {
        status: isActive ? DownloadStatus.DOWNLOADING : DownloadStatus.QUEUED,
        isDownloaded: false,
        isDownloading: isActive,
        isQueued: inQueue,
        isFailed: false,
        isPaused: false,
        progress: 0,
      };
    }

    // Default: not downloaded, not in queue
    return {
      status: DownloadStatus.QUEUED,
      isDownloaded: false,
      isDownloading: false,
      isQueued: false,
      isFailed: false,
      isPaused: false,
      progress: 0,
    };
  })();

  return {
    ...statusInfo,
    isLoading,
    refresh: checkDownloaded,
    downloadId,
  };
};
