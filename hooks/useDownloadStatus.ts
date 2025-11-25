import { useState, useEffect, useCallback, useRef } from 'react';
import { downloadManagerService } from '@/services/downloadManager';
import { chapterStorageService } from '@/services/chapterStorageService';
import { downloadQueueService } from '@/services/downloadQueue';
import { DownloadStatus } from '@/types/download';
import { logger } from '@/utils/logger';
import {
  downloadEventEmitter,
  type DownloadStatusEvent,
} from '@/utils/downloadEventEmitter';

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
  const [statusInfo, setStatusInfo] = useState<DownloadStatusInfo>({
    status: DownloadStatus.QUEUED,
    isDownloaded: false,
    isDownloading: false,
    isQueued: true,
    isFailed: false,
    isPaused: false,
    progress: 0,
  });

  const [isLoading, setIsLoading] = useState(true);
  const progressListenerRef = useRef<(() => void) | null>(null);
  const mountedRef = useRef(true);

  const downloadId = `${mangaId}_${chapterNumber}`;

  const updateStatusInfo = useCallback(async () => {
    if (!mountedRef.current) return;

    try {
      setIsLoading(true);

      // Check if chapter is downloaded first (fastest check)
      const isDownloaded = await chapterStorageService.isChapterDownloaded(
        mangaId,
        chapterNumber
      );

      if (isDownloaded) {
        if (mountedRef.current) {
          setStatusInfo({
            status: DownloadStatus.COMPLETED,
            isDownloaded: true,
            isDownloading: false,
            isQueued: false,
            isFailed: false,
            isPaused: false,
            progress: 100,
          });
          setIsLoading(false);
        }
        return;
      }

      // Check download queue status
      const queueItem = await downloadQueueService.getDownloadById(downloadId);
      if (queueItem) {
        const queueStatus = queueItem.status;

        // Get progress if downloading
        let progress: number = 0;
        let estimatedTimeRemaining: number | undefined;
        let downloadSpeed: number | undefined;

        if (queueStatus === DownloadStatus.DOWNLOADING) {
          const progressData =
            downloadManagerService.getDownloadProgress(downloadId);
          if (progressData) {
            progress = progressData.progress || 0;
            estimatedTimeRemaining = progressData.estimatedTimeRemaining;
            downloadSpeed = progressData.downloadSpeed;
          }
        }

        if (mountedRef.current) {
          setStatusInfo({
            status: queueStatus,
            isDownloaded: false,
            isDownloading: queueStatus === DownloadStatus.DOWNLOADING,
            isQueued: queueStatus === DownloadStatus.QUEUED,
            isFailed: queueStatus === DownloadStatus.FAILED,
            isPaused: queueStatus === DownloadStatus.PAUSED,
            progress,
            estimatedTimeRemaining,
            downloadSpeed,
          });
          setIsLoading(false);
        }
        return;
      }

      // Check if actively downloading (might not be in queue yet)
      const activeDownloads = await downloadManagerService.getActiveDownloads();
      const activeDownload = activeDownloads.find((d) =>
        d.id.includes(downloadId)
      );

      if (activeDownload) {
        const progressData =
          downloadManagerService.getDownloadProgress(downloadId);

        if (mountedRef.current) {
          setStatusInfo({
            status: DownloadStatus.DOWNLOADING,
            isDownloaded: false,
            isDownloading: true,
            isQueued: false,
            isFailed: false,
            isPaused: false,
            progress: progressData?.progress || 0,
            estimatedTimeRemaining: progressData?.estimatedTimeRemaining,
            downloadSpeed: progressData?.downloadSpeed,
          });
          setIsLoading(false);
        }
        return;
      }

      // Check for any download containing the mangaId and chapterNumber in different formats
      const alternativeActiveDownload = activeDownloads.find(
        (d) => d.mangaId === mangaId && d.chapterNumber === chapterNumber
      );

      if (alternativeActiveDownload) {
        const progressData = downloadManagerService.getDownloadProgress(
          alternativeActiveDownload.id
        );

        if (mountedRef.current) {
          setStatusInfo({
            status: DownloadStatus.DOWNLOADING,
            isDownloaded: false,
            isDownloading: true,
            isQueued: false,
            isFailed: false,
            isPaused: false,
            progress: progressData?.progress || 0,
            estimatedTimeRemaining: progressData?.estimatedTimeRemaining,
            downloadSpeed: progressData?.downloadSpeed,
          });
          setIsLoading(false);
        }
        return;
      }

      // Default to queued status
      if (mountedRef.current) {
        setStatusInfo({
          status: DownloadStatus.QUEUED,
          isDownloaded: false,
          isDownloading: false,
          isQueued: true,
          isFailed: false,
          isPaused: false,
          progress: 0,
        });
        setIsLoading(false);
      }
    } catch (error) {
      log.error('UI', 'Error updating download status', {
        mangaId,
        chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      });

      if (mountedRef.current) {
        setStatusInfo({
          status: DownloadStatus.FAILED,
          isDownloaded: false,
          isDownloading: false,
          isQueued: false,
          isFailed: true,
          isPaused: false,
          progress: 0,
        });
        setIsLoading(false);
      }
    }
  }, [mangaId, chapterNumber, downloadId, log]);

  const setupEventListeners = useCallback(() => {
    // Clean up existing listener
    if (progressListenerRef.current) {
      progressListenerRef.current();
      progressListenerRef.current = null;
    }

    // Subscribe to download events
    const unsubscribe = downloadEventEmitter.subscribe(
      mangaId,
      chapterNumber,
      (event: DownloadStatusEvent) => {
        if (!mountedRef.current) return;

        setStatusInfo((prev) => {
          switch (event.type) {
            case 'download_started':
            case 'download_resumed':
              return {
                status: DownloadStatus.DOWNLOADING,
                isDownloaded: false,
                isDownloading: true,
                isQueued: false,
                isFailed: false,
                isPaused: event.type === 'download_resumed',
                progress: event.progress || 0,
                estimatedTimeRemaining: event.estimatedTimeRemaining,
                downloadSpeed: event.downloadSpeed,
              };
            case 'download_progress':
              return {
                status: DownloadStatus.DOWNLOADING,
                isDownloaded: false,
                isDownloading: true,
                isQueued: false,
                isFailed: false,
                isPaused: false,
                progress: event.progress || 0,
                estimatedTimeRemaining: event.estimatedTimeRemaining,
                downloadSpeed: event.downloadSpeed,
              };
            case 'download_completed':
              return {
                status: DownloadStatus.COMPLETED,
                isDownloaded: true,
                isDownloading: false,
                isQueued: false,
                isFailed: false,
                isPaused: false,
                progress: 100,
              };
            case 'download_failed':
              return {
                status: DownloadStatus.FAILED,
                isDownloaded: false,
                isDownloading: false,
                isQueued: false,
                isFailed: true,
                isPaused: false,
                progress: 0,
              };
            case 'download_paused':
              return {
                status: DownloadStatus.PAUSED,
                isDownloaded: false,
                isDownloading: false,
                isQueued: false,
                isFailed: false,
                isPaused: true,
                progress: event.progress || 0,
              };
            case 'download_deleted':
              return {
                status: DownloadStatus.QUEUED,
                isDownloaded: false,
                isDownloading: false,
                isQueued: true,
                isFailed: false,
                isPaused: false,
                progress: 0,
              };
            default:
              return prev;
          }
        });

        setIsLoading(false);
      }
    );

    progressListenerRef.current = unsubscribe;
  }, [mangaId, chapterNumber]);

  const refresh = useCallback(() => {
    updateStatusInfo();
  }, [updateStatusInfo]);

  // Initial load and setup
  useEffect(() => {
    mountedRef.current = true;

    const loadData = async () => {
      await updateStatusInfo();
      setupEventListeners();
    };

    loadData();

    return () => {
      mountedRef.current = false;
      if (progressListenerRef.current) {
        progressListenerRef.current();
        progressListenerRef.current = null;
      }
    };
  }, [updateStatusInfo, setupEventListeners]);

  // Re-setup listeners when mangaId or chapterNumber changes
  useEffect(() => {
    setupEventListeners();
  }, [mangaId, chapterNumber, setupEventListeners]);

  return {
    ...statusInfo,
    isLoading,
    refresh,
    downloadId,
  };
};
