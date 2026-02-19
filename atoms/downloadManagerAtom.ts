import {
  atom,
  injectStore,
  injectEffect,
  injectAtomGetters,
  api,
} from '@zedux/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import {
  DownloadManagerAtomState,
  DownloadProgressInfo,
  PausedDownloadInfo,
  DownloadContext,
} from '@/types/atoms';
import { DownloadErrorType } from '@/types/download';
import { logger } from '@/utils/logger';
import { bookmarkAtom } from '@/atoms/bookmarkAtomFamily';
import { batchDownloadOrchestrator } from '@/services/batchDownloadOrchestrator';

const PAUSED_DOWNLOAD_STORAGE_KEY = 'download_manager_paused_contexts';

const createEmptyState = (): DownloadManagerAtomState => ({
  activeDownloads: new Map<string, DownloadProgressInfo>(),
  pausedDownloads: new Map<string, PausedDownloadInfo>(),
  downloadContexts: new Map<string, DownloadContext>(),
});

/**
 * Download Manager Atom
 *
 * Manages active downloads, progress tracking, and paused download contexts.
 *
 * Key behaviors:
 * - Tracks download progress (images downloaded, bytes, speed, ETA)
 * - Persists paused download contexts to AsyncStorage for resume after restart
 * - Reacts to AppState changes: pauses all active downloads on background,
 *   resumes app-state-paused downloads on foreground
 * - Network errors pause downloads (resumable); other errors fail them
 * - Integrates with batchDownloadOrchestrator for chapter image fetching
 * - Updates bookmarkAtomFamily when a download completes (adds to downloadedChapters)
 *
 * Dependencies: bookmarkAtomFamily (update on complete), batchDownloadOrchestrator
 * Persistence: AsyncStorage key `download_manager_paused_contexts`
 *
 * @see hooks/useDownloadProgress.ts for React hook access
 * @see atoms/downloadQueueAtom.ts for queue management
 * @see atoms/selectors/downloadSelectors.ts for derived selectors
 * @see Requirements 7.1–7.8
 */
export const downloadManagerAtom = atom('downloadManager', () => {
  const store = injectStore<DownloadManagerAtomState>(createEmptyState());
  const { getInstance } = injectAtomGetters();
  const log = logger();

  // --- Persistence helpers ---

  const persistPausedDownloads = async () => {
    try {
      const state = store.getState();
      const entries: Array<{
        downloadId: string;
        info: PausedDownloadInfo;
      }> = [];

      for (const [downloadId, info] of state.pausedDownloads.entries()) {
        entries.push({ downloadId, info });
      }

      if (entries.length === 0) {
        await AsyncStorage.removeItem(PAUSED_DOWNLOAD_STORAGE_KEY);
        return;
      }

      await AsyncStorage.setItem(
        PAUSED_DOWNLOAD_STORAGE_KEY,
        JSON.stringify(entries)
      );
    } catch (error) {
      log.error('Storage', 'Failed to persist paused downloads', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const loadPausedDownloads = async () => {
    try {
      const raw = await AsyncStorage.getItem(PAUSED_DOWNLOAD_STORAGE_KEY);
      if (!raw) return;

      const entries: Array<{
        downloadId: string;
        info: PausedDownloadInfo;
      }> = JSON.parse(raw);

      if (!Array.isArray(entries)) return;

      const state = store.getState();
      const newPaused = new Map(state.pausedDownloads);
      const newContexts = new Map(state.downloadContexts);

      for (const entry of entries) {
        if (!entry?.downloadId || !entry?.info?.context) continue;

        newPaused.set(entry.downloadId, entry.info);
        newContexts.set(entry.downloadId, entry.info.context);
      }

      store.setState({
        ...state,
        pausedDownloads: newPaused,
        downloadContexts: newContexts,
      });

      log.info('Storage', 'Loaded paused downloads', {
        count: newPaused.size,
      });
    } catch (error) {
      log.error('Storage', 'Failed to load paused downloads', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // --- State mutation helpers (always produce new Maps for immutability) ---

  const cloneState = (): DownloadManagerAtomState => {
    const s = store.getState();
    return {
      activeDownloads: new Map(s.activeDownloads),
      pausedDownloads: new Map(s.pausedDownloads),
      downloadContexts: new Map(s.downloadContexts),
    };
  };

  // --- Exported actions ---

  /**
   * Register a new download and create its initial progress entry.
   */
  const startDownload = (context: DownloadContext) => {
    const next = cloneState();

    const progress: DownloadProgressInfo = {
      downloadId: context.downloadId,
      mangaId: context.mangaId,
      mangaTitle: context.mangaTitle,
      chapterNumber: context.chapterNumber,
      totalImages: 0,
      downloadedImages: 0,
      failedImages: 0,
      progress: 0,
      startTime: context.startTime || Date.now(),
      lastUpdateTime: Date.now(),
      totalBytes: 0,
      downloadedBytes: 0,
    };

    next.activeDownloads.set(context.downloadId, progress);
    next.downloadContexts.set(context.downloadId, context);
    // Remove from paused if it was there
    next.pausedDownloads.delete(context.downloadId);

    store.setState(next);
  };

  /**
   * Pause an active download. Persists to AsyncStorage for resume capability.
   */
  const pauseDownload = async (
    downloadId: string,
    reason: 'manual' | 'error' | 'app_state' = 'manual'
  ) => {
    const next = cloneState();
    const progress = next.activeDownloads.get(downloadId);
    const context = next.downloadContexts.get(downloadId);

    if (!context) {
      log.warn('Service', 'Cannot pause download: context not found', {
        downloadId,
      });
      return;
    }

    const pausedInfo: PausedDownloadInfo = {
      context,
      progress: progress || {
        downloadId,
        mangaId: context.mangaId,
        mangaTitle: context.mangaTitle,
        chapterNumber: context.chapterNumber,
        totalImages: 0,
        downloadedImages: 0,
        failedImages: 0,
        progress: 0,
        startTime: context.startTime,
        lastUpdateTime: Date.now(),
        totalBytes: 0,
        downloadedBytes: 0,
      },
      pausedAt: Date.now(),
      pauseReason: reason,
    };

    next.pausedDownloads.set(downloadId, pausedInfo);
    next.activeDownloads.delete(downloadId);

    store.setState(next);
    await persistPausedDownloads();

    log.info('Service', 'Download paused', { downloadId, reason });
  };

  /**
   * Resume a previously paused download.
   */
  const resumeDownload = (downloadId: string) => {
    const next = cloneState();
    const pausedInfo = next.pausedDownloads.get(downloadId);

    if (!pausedInfo) {
      log.warn('Service', 'Cannot resume download: not found in paused', {
        downloadId,
      });
      return;
    }

    // Restore progress entry and move back to active
    const progress: DownloadProgressInfo = {
      ...pausedInfo.progress,
      lastUpdateTime: Date.now(),
    };

    next.activeDownloads.set(downloadId, progress);
    next.downloadContexts.set(downloadId, pausedInfo.context);
    next.pausedDownloads.delete(downloadId);

    store.setState(next);

    // Fire-and-forget persistence update
    persistPausedDownloads().catch(() => {});

    log.info('Service', 'Download resumed', { downloadId });
  };

  /**
   * Update progress for an active download.
   * Calculates progress percentage, download speed, and ETA.
   */
  const updateProgress = (
    downloadId: string,
    update: Partial<
      Pick<
        DownloadProgressInfo,
        | 'downloadedImages'
        | 'failedImages'
        | 'totalImages'
        | 'downloadedBytes'
        | 'totalBytes'
      >
    >
  ) => {
    const next = cloneState();
    const existing = next.activeDownloads.get(downloadId);
    if (!existing) return;

    const updated: DownloadProgressInfo = { ...existing, ...update };
    const now = Date.now();
    updated.lastUpdateTime = now;

    // Calculate progress percentage
    if (updated.totalImages > 0) {
      updated.progress = Math.round(
        (updated.downloadedImages / updated.totalImages) * 100
      );
    }

    // Calculate download speed (bytes/sec) and ETA
    const elapsed = (now - updated.startTime) / 1000;
    if (elapsed > 0 && updated.downloadedBytes > 0) {
      updated.downloadSpeed = updated.downloadedBytes / elapsed;

      if (updated.downloadSpeed > 0 && updated.totalImages > 0) {
        const remainingImages = updated.totalImages - updated.downloadedImages;
        const avgBytesPerImage =
          updated.downloadedBytes / Math.max(updated.downloadedImages, 1);
        const remainingBytes = remainingImages * avgBytesPerImage;
        updated.estimatedTimeRemaining = Math.round(
          remainingBytes / updated.downloadSpeed
        );
      }
    }

    next.activeDownloads.set(downloadId, updated);
    store.setState(next);
  };

  /**
   * Mark a download as complete, update the manga's downloadedChapters,
   * and clean up its tracking state.
   */
  const completeDownload = async (downloadId: string) => {
    const state = store.getState();
    const context = state.downloadContexts.get(downloadId);

    // Update manga's downloadedChapters via the bookmark atom family
    if (context) {
      try {
        const bookmarkInstance = getInstance(bookmarkAtom, [context.mangaId]);
        const mangaData = bookmarkInstance.getState();

        if (mangaData) {
          const currentDownloaded = mangaData.downloadedChapters || [];
          if (!currentDownloaded.includes(context.chapterNumber)) {
            await bookmarkInstance.exports.updateMangaData({
              downloadedChapters: [...currentDownloaded, context.chapterNumber],
            });
          }
        }
      } catch (error) {
        log.warn('Service', 'Failed to update downloadedChapters on bookmark', {
          downloadId,
          mangaId: context.mangaId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    // Clean up tracking state
    const next = cloneState();
    next.activeDownloads.delete(downloadId);
    next.downloadContexts.delete(downloadId);
    next.pausedDownloads.delete(downloadId);
    store.setState(next);

    persistPausedDownloads().catch(() => {});

    // Notify batch download orchestrator
    if (context) {
      batchDownloadOrchestrator.handleDownloadEvent({
        type: 'download_completed',
        mangaId: context.mangaId,
        chapterNumber: context.chapterNumber,
      });
    }

    log.info('Service', 'Download completed', { downloadId });
  };

  /**
   * Mark a download as failed. Network errors → paused, others → removed.
   */
  const failDownload = async (
    downloadId: string,
    errorType: DownloadErrorType,
    errorMessage: string
  ) => {
    const next = cloneState();
    const progress = next.activeDownloads.get(downloadId);
    const context = next.downloadContexts.get(downloadId);

    if (progress) {
      progress.error = { type: errorType, message: errorMessage };
    }

    // Network errors → pause for retry; other errors → mark as failed and remove
    if (errorType === DownloadErrorType.NETWORK_ERROR && context) {
      const pausedInfo: PausedDownloadInfo = {
        context,
        progress: progress || {
          downloadId,
          mangaId: context.mangaId,
          mangaTitle: context.mangaTitle,
          chapterNumber: context.chapterNumber,
          totalImages: 0,
          downloadedImages: 0,
          failedImages: 0,
          progress: 0,
          startTime: context.startTime,
          lastUpdateTime: Date.now(),
          totalBytes: 0,
          downloadedBytes: 0,
          error: { type: errorType, message: errorMessage },
        },
        pausedAt: Date.now(),
        pauseReason: 'error',
      };

      next.pausedDownloads.set(downloadId, pausedInfo);
      next.activeDownloads.delete(downloadId);

      log.warn('Service', 'Download paused due to network error', {
        downloadId,
        errorMessage,
      });
    } else {
      next.activeDownloads.delete(downloadId);
      next.downloadContexts.delete(downloadId);
      next.pausedDownloads.delete(downloadId);

      log.error('Service', 'Download failed', {
        downloadId,
        errorType,
        errorMessage,
      });
    }

    store.setState(next);
    await persistPausedDownloads();

    // Notify batch download orchestrator
    if (context) {
      batchDownloadOrchestrator.handleDownloadEvent({
        type: 'download_failed',
        mangaId: context.mangaId,
        chapterNumber: context.chapterNumber,
        error: errorMessage,
      });
    }
  };

  /**
   * Pause all active downloads (used when app goes to background).
   */
  const pauseAllActive = async (
    reason: 'app_state' | 'error' = 'app_state'
  ) => {
    const state = store.getState();
    const downloadIds = Array.from(state.activeDownloads.keys());

    for (const downloadId of downloadIds) {
      await pauseDownload(downloadId, reason);
    }
  };

  /**
   * Resume all downloads that were paused for a given reason.
   */
  const resumeByReason = (reason: 'app_state' | 'error') => {
    const state = store.getState();
    const candidates: string[] = [];

    for (const [downloadId, info] of state.pausedDownloads.entries()) {
      if (info.pauseReason === reason) {
        candidates.push(downloadId);
      }
    }

    for (const downloadId of candidates) {
      resumeDownload(downloadId);
    }
  };

  // --- AppState subscription for background/foreground handling ---

  injectEffect(() => {
    const handleAppStateChange = async (nextAppState: AppStateStatus) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        await pauseAllActive('app_state');
      } else if (nextAppState === 'active') {
        resumeByReason('app_state');
      }
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

    return () => {
      subscription.remove();
    };
  }, []);

  // --- Load persisted paused downloads on initialization ---

  injectEffect(() => {
    loadPausedDownloads();
  }, []);

  return api(store).setExports({
    startDownload,
    pauseDownload,
    resumeDownload,
    updateProgress,
    completeDownload,
    failDownload,
    pauseAllActive,
    resumeByReason,
  });
});
