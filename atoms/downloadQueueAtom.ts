import {
  atom,
  injectStore,
  injectEffect,
  injectAtomGetters,
  api,
} from '@zedux/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DownloadQueueAtomState, DownloadContext } from '@/types/atoms';
import { DownloadQueueItem, DownloadErrorType } from '@/types/download';
import { settingsAtom } from '@/atoms/settingsAtom';

const MAX_RETRIES = 3;
import { downloadManagerAtom } from '@/atoms/downloadManagerAtom';
import { logger } from '@/utils/logger';

const QUEUE_STORAGE_KEY = 'download_queue';

/**
 * Download Queue Atom
 *
 * Manages the download queue with priority ordering and concurrent download limits.
 *
 * Key behaviors:
 * - Respects `maxConcurrentDownloads` from settingsAtom (default: 3)
 * - Items are sorted by priority (higher = first) then by addedAt (FIFO within same priority)
 * - Auto-starts next queued download when an active one completes
 * - Network errors trigger retry with decremented priority (up to MAX_RETRIES=3)
 * - Queue state is persisted to AsyncStorage for restoration after app restart
 *
 * Dependencies: settingsAtom (maxConcurrentDownloads), downloadManagerAtom (startDownload)
 * Persistence: AsyncStorage key `download_queue`
 *
 * @see hooks/useDownloadQueue.ts for React hook access
 * @see atoms/downloadManagerAtom.ts for download execution
 * @see atoms/selectors/downloadSelectors.ts for queue status selector
 * @see Requirements 8.1–8.5
 */
const createEmptyState = (): DownloadQueueAtomState => ({
  queue: [],
  activeDownloadIds: new Set<string>(),
  isPaused: false,
  isProcessing: false,
});

export const downloadQueueAtom = atom('downloadQueue', () => {
  const store = injectStore<DownloadQueueAtomState>(createEmptyState());
  const { get, getInstance } = injectAtomGetters();
  const log = logger();

  // --- Persistence helpers ---

  const persistQueue = async () => {
    try {
      const state = store.getState();
      const data = {
        items: state.queue,
        activeDownloadIds: Array.from(state.activeDownloadIds),
        isPaused: state.isPaused,
        lastProcessed: Date.now(),
      };
      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      log.error('Storage', 'Failed to persist download queue', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const loadQueue = async () => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (!raw) return;

      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.items)) return;

      const state = store.getState();
      store.setState({
        ...state,
        queue: data.items,
        isPaused: data.isPaused || false,
      });

      log.info('Storage', 'Loaded download queue', {
        count: data.items.length,
      });
    } catch (error) {
      log.error('Storage', 'Failed to load download queue', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // --- Queue helpers ---

  const sortByPriority = (items: DownloadQueueItem[]): DownloadQueueItem[] => {
    return [...items].sort((a, b) => {
      if (a.priority !== b.priority) return b.priority - a.priority;
      return a.addedAt - b.addedAt;
    });
  };

  const getMaxConcurrent = (): number => {
    try {
      const settings = get(settingsAtom);
      return settings.downloadSettings?.maxConcurrentDownloads ?? 3;
    } catch {
      return 3;
    }
  };

  // --- Process queue ---

  const processQueue = () => {
    const state = store.getState();
    if (state.isPaused || state.queue.length === 0) {
      if (state.isProcessing) {
        store.setState({ ...state, isProcessing: false });
      }
      return;
    }

    const maxConcurrent = getMaxConcurrent();
    if (state.activeDownloadIds.size >= maxConcurrent) return;

    const slotsAvailable = maxConcurrent - state.activeDownloadIds.size;
    const itemsToStart = state.queue.slice(0, slotsAvailable);

    if (itemsToStart.length === 0) return;

    const newQueue = state.queue.slice(slotsAvailable);
    const newActiveIds = new Set(state.activeDownloadIds);

    for (const item of itemsToStart) {
      newActiveIds.add(item.id);

      // Start the download via the download manager atom
      try {
        const dmInstance = getInstance(downloadManagerAtom);
        const context: DownloadContext = {
          downloadId: item.id,
          mangaId: item.mangaId,
          mangaTitle: item.mangaTitle,
          chapterNumber: item.chapterNumber,
          chapterUrl: item.chapterUrl,
          startTime: Date.now(),
        };
        dmInstance.exports.startDownload(context);
      } catch (error) {
        log.error('Service', 'Failed to start download from queue', {
          downloadId: item.id,
          error: error instanceof Error ? error.message : String(error),
        });
        newActiveIds.delete(item.id);
      }
    }

    store.setState({
      ...store.getState(),
      queue: newQueue,
      activeDownloadIds: newActiveIds,
      isProcessing: newQueue.length > 0 || newActiveIds.size > 0,
    });

    persistQueue().catch(() => {});
  };

  // --- Exported actions ---

  /**
   * Add a download item to the queue. Starts processing if not paused.
   */
  const queueDownload = (item: DownloadQueueItem) => {
    const state = store.getState();

    // Check if already queued or active
    const exists =
      state.queue.some((q) => q.id === item.id) ||
      state.activeDownloadIds.has(item.id);

    if (exists) {
      log.info('Service', 'Download already in queue/active', {
        downloadId: item.id,
      });
      return;
    }

    const newQueue = sortByPriority([...state.queue, item]);
    store.setState({
      ...state,
      queue: newQueue,
      isProcessing: true,
    });

    persistQueue().catch(() => {});

    if (!state.isPaused) {
      // Defer processing to next tick to allow state to settle
      setTimeout(() => processQueue(), 0);
    }
  };

  /**
   * Remove a download from the queue (does not cancel active downloads).
   */
  const removeFromQueue = (mangaId: string, chapterNumber: string) => {
    const state = store.getState();
    const targetId = `${mangaId}_${chapterNumber}`;

    const newQueue = state.queue.filter(
      (item) =>
        !(item.mangaId === mangaId && item.chapterNumber === chapterNumber)
    );

    const newActiveIds = new Set(state.activeDownloadIds);
    newActiveIds.delete(targetId);

    store.setState({
      ...state,
      queue: newQueue,
      activeDownloadIds: newActiveIds,
      isProcessing: newQueue.length > 0 || newActiveIds.size > 0,
    });

    persistQueue().catch(() => {});
  };

  /**
   * Mark a download as completed and start the next queued item if capacity allows.
   */
  const onDownloadComplete = (downloadId: string) => {
    const state = store.getState();
    const newActiveIds = new Set(state.activeDownloadIds);
    newActiveIds.delete(downloadId);

    store.setState({
      ...state,
      activeDownloadIds: newActiveIds,
      isProcessing: state.queue.length > 0 || newActiveIds.size > 0,
    });

    persistQueue().catch(() => {});

    // Auto-start next download
    setTimeout(() => processQueue(), 100);
  };

  /**
   * Handle a failed download. Retry for network errors (up to MAX_RETRIES), remove otherwise.
   */
  const onDownloadFailed = (
    downloadId: string,
    errorType: DownloadErrorType,
    item?: DownloadQueueItem,
    retryCount: number = 0
  ) => {
    const state = store.getState();
    const newActiveIds = new Set(state.activeDownloadIds);
    newActiveIds.delete(downloadId);

    let newQueue = [...state.queue];

    // For retryable errors (network), re-queue with lower priority
    const isRetryable =
      errorType === DownloadErrorType.NETWORK_ERROR && retryCount < MAX_RETRIES;

    if (isRetryable && item) {
      const retryItem: DownloadQueueItem = {
        ...item,
        priority: Math.max(item.priority - 1, 0),
        addedAt: Date.now(),
      };
      newQueue = sortByPriority([...newQueue, retryItem]);
      log.info('Service', 'Re-queuing download for retry', {
        downloadId,
        retryCount: retryCount + 1,
        maxRetries: MAX_RETRIES,
      });
    } else if (item && retryCount >= MAX_RETRIES) {
      log.warn('Service', 'Download exceeded max retries', {
        downloadId,
        retryCount,
      });
    }

    store.setState({
      ...state,
      queue: newQueue,
      activeDownloadIds: newActiveIds,
      isProcessing: newQueue.length > 0 || newActiveIds.size > 0,
    });

    persistQueue().catch(() => {});

    // Try to process next item
    setTimeout(() => processQueue(), 500);
  };

  /**
   * Clear all queued downloads. Does not cancel active downloads.
   */
  const clearQueue = () => {
    const state = store.getState();
    store.setState({
      ...state,
      queue: [],
      isProcessing: state.activeDownloadIds.size > 0,
    });

    persistQueue().catch(() => {});
  };

  /**
   * Pause the queue. Active downloads continue but no new ones start.
   */
  const pauseQueue = () => {
    const state = store.getState();
    store.setState({ ...state, isPaused: true });
    persistQueue().catch(() => {});
  };

  /**
   * Resume the queue and start processing.
   */
  const resumeQueue = () => {
    const state = store.getState();
    store.setState({ ...state, isPaused: false });
    persistQueue().catch(() => {});
    setTimeout(() => processQueue(), 0);
  };

  /**
   * Check if a specific manga chapter is in the queue or active.
   */
  const isInQueue = (mangaId: string, chapterNumber: string): boolean => {
    const state = store.getState();
    const targetId = `${mangaId}_${chapterNumber}`;
    return (
      state.queue.some(
        (i) => i.mangaId === mangaId && i.chapterNumber === chapterNumber
      ) || state.activeDownloadIds.has(targetId)
    );
  };

  // --- Load persisted queue on initialization ---

  injectEffect(() => {
    loadQueue().then(() => {
      const state = store.getState();
      if (!state.isPaused && state.queue.length > 0) {
        setTimeout(() => processQueue(), 500);
      }
    });
  }, []);

  return api(store).setExports({
    queueDownload,
    removeFromQueue,
    onDownloadComplete,
    onDownloadFailed,
    clearQueue,
    pauseQueue,
    resumeQueue,
    processQueue,
    isInQueue,
  });
});
