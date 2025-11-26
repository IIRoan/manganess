import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import {
  DownloadQueueItem,
  QueueStatus,
  DownloadStatus,
  DownloadItem,
} from '@/types/download';
import { DownloadQueue } from '@/types/downloadInterfaces';
import { isDebugEnabled } from '@/constants/env';
import { downloadManagerService } from './downloadManager';

// Queue configuration
const QUEUE_STORAGE_KEY = 'download_queue';
const MAX_CONCURRENT_DOWNLOADS = 1; // Enforce 1 at a time for WebView safety

interface QueueState {
  items: DownloadQueueItem[];
  activeDownloads: Map<string, DownloadItem>;
  isPaused: boolean;
  isProcessing: boolean;
}

interface PersistedQueueData {
  items: DownloadQueueItem[];
  activeDownloads: DownloadItem[];
  isPaused: boolean;
  lastProcessed: number;
}

export interface ActiveWebViewRequest {
  id: string; // Download ID
  mangaId: string;
  chapterNumber: string;
  url: string;
  attempt: number;
}

class DownloadQueueService implements DownloadQueue {
  private static instance: DownloadQueueService;
  private state: QueueState;
  private initialized: boolean = false;
  private saveTimer: any = null;
  private static readonly SAVE_DEBOUNCE_MS = 2000;

  // WebView Coordination
  private activeWebViewRequest: ActiveWebViewRequest | null = null;
  private webViewListeners: Set<
    (request: ActiveWebViewRequest | null) => void
  > = new Set();
  private currentDownloadResolver:
    | ((data: { chapterId: string; vrfToken: string }) => void)
    | null = null;
  private currentDownloadRejecter: ((error: Error) => void) | null = null;

  // Event listeners for queue updates
  private listeners: Set<(status: QueueStatus) => void> = new Set();

  private constructor() {
    this.state = {
      items: [],
      activeDownloads: new Map(),
      isPaused: false,
      isProcessing: false,
    };
  }

  static getInstance(): DownloadQueueService {
    if (!DownloadQueueService.instance) {
      DownloadQueueService.instance = new DownloadQueueService();
    }
    return DownloadQueueService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      this.initialized = true;

      await this.loadQueueFromStorage();
      await this.setupAppStateHandling();

      if (isDebugEnabled()) {
        console.log('Download queue service initialized');
      }

      // Auto-resume: Start processing if we have items
      setTimeout(() => {
        if (!this.state.isPaused && this.state.items.length > 0) {
          this.processQueue();
        }
      }, 500);
    } catch (error) {
      this.initialized = false;
      console.error('Failed to initialize download queue:', error);
      throw error;
    }
  }

  private async setupAppStateHandling(): Promise<void> {
    AppState.addEventListener('change', this.handleAppStateChange.bind(this));
  }

  private async handleAppStateChange(
    nextAppState: AppStateStatus
  ): Promise<void> {
    if (nextAppState === 'background') {
      await this.persistQueueForBackground();
    } else if (nextAppState === 'active') {
      await this.restoreFromBackground();
      // Trigger processing on resume
      if (
        !this.state.isPaused &&
        (this.state.items.length > 0 || this.state.activeDownloads.size > 0)
      ) {
        this.processQueue();
      }
    }
  }

  private async persistQueueForBackground(): Promise<void> {
    try {
      const backgroundState = {
        items: this.state.items,
        activeDownloads: Array.from(this.state.activeDownloads.entries()),
        isPaused: this.state.isPaused,
        isProcessing: this.state.isProcessing,
        backgroundTimestamp: Date.now(),
      };

      await AsyncStorage.setItem(
        'queue_background_state',
        JSON.stringify(backgroundState)
      );
    } catch (error) {
      console.error('Failed to persist queue for background:', error);
    }
  }

  private async restoreFromBackground(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('queue_background_state');
      if (!stored) return;

      // We don't necessarily need to restore state here because loadQueueFromStorage
      // handles the main persistence. This is mostly for short-term backgrounding.
      // However, to be safe, we just clear the background flag.
      // The persistent storage is the source of truth.

      await AsyncStorage.removeItem('queue_background_state');
    } catch (error) {
      console.error('Failed to restore from background:', error);
    }
  }

  private async loadQueueFromStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        const data: PersistedQueueData = JSON.parse(stored);

        // Start with stored items
        const restoredItems = data.items || [];

        // CRITICAL: Any "active" downloads from the previous session are now technically "interrupted".
        // We must put them back into the QUEUE to be restarted.
        if (data.activeDownloads && data.activeDownloads.length > 0) {
          const activeAsQueueItems: DownloadQueueItem[] =
            data.activeDownloads.map((download) => ({
              id: download.id,
              mangaId: download.mangaId,
              mangaTitle: download.mangaTitle,
              chapterNumber: download.chapterNumber,
              chapterUrl: download.chapterUrl,
              priority: 2, // High priority for interrupted
              addedAt: download.createdAt,
            }));

          for (const item of activeAsQueueItems) {
            if (!restoredItems.some((existing) => existing.id === item.id)) {
              restoredItems.push(item);
            }
          }
        }

        this.state.items = restoredItems;
        this.state.activeDownloads.clear(); // Clear active, they are now in queue
        this.state.isPaused = data.isPaused || false;

        this.sortQueueByPriority();

        if (isDebugEnabled()) {
          console.log(
            `Loaded ${this.state.items.length} items from queue storage`
          );
        }
      }
    } catch (error) {
      console.error('Failed to load queue from storage:', error);
      this.state.items = [];
      this.state.isPaused = false;
    }
  }

  private async saveQueueToStorage(): Promise<void> {
    try {
      // When saving, if we have an active download, we should save it as 'active'
      // so we know what was running.
      const data: PersistedQueueData = {
        items: this.state.items,
        activeDownloads: Array.from(this.state.activeDownloads.values()),
        isPaused: this.state.isPaused,
        lastProcessed: Date.now(),
      };

      await AsyncStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save queue to storage:', error);
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return;

    this.saveTimer = setTimeout(async () => {
      this.saveTimer = null;
      try {
        await this.saveQueueToStorage();
      } catch (error) {
        console.error('Error in scheduled queue save:', error);
      }
    }, DownloadQueueService.SAVE_DEBOUNCE_MS);
  }

  private notifyListeners(): void {
    const status = this.getQueueStatusSync();
    this.listeners.forEach((listener) => {
      try {
        listener(status);
      } catch (error) {
        console.error('Error in queue status listener:', error);
      }
    });
  }

  private getQueueStatusSync(): QueueStatus {
    return {
      totalItems: this.state.items.length + this.state.activeDownloads.size,
      activeDownloads: this.state.activeDownloads.size,
      queuedItems: this.state.items.length,
      isPaused: this.state.isPaused,
      isProcessing: this.state.isProcessing,
    };
  }

  async addToQueue(item: DownloadQueueItem): Promise<void> {
    await this.initialize();

    // Check if item already exists
    const exists =
      this.state.items.some((queueItem) => queueItem.id === item.id) ||
      this.state.activeDownloads.has(item.id);

    if (exists) {
      if (isDebugEnabled())
        console.log(`Item ${item.id} already in queue/active`);
      return;
    }

    this.state.items.push(item);
    this.sortQueueByPriority();

    this.scheduleSave();
    this.notifyListeners();

    if (!this.state.isPaused) {
      this.processQueue();
    }
  }

  private sortQueueByPriority(): void {
    this.state.items.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.addedAt - b.addedAt;
    });
  }

  async removeFromQueue(
    mangaId: string,
    chapterNumber: string
  ): Promise<boolean> {
    await this.initialize();

    const initialLength = this.state.items.length;
    this.state.items = this.state.items.filter(
      (item) =>
        !(item.mangaId === mangaId && item.chapterNumber === chapterNumber)
    );

    // If it's active, we try to cancel it
    const targetId = `${mangaId}_${chapterNumber}`;
    if (this.state.activeDownloads.has(targetId)) {
      await downloadManagerService.cancelDownload(targetId);
      // The cancellation will eventually trigger cleanup, but we can force remove from our map
      this.state.activeDownloads.delete(targetId);
    }

    this.scheduleSave();
    this.notifyListeners();
    return this.state.items.length < initialLength;
  }

  async processQueue(): Promise<void> {
    await this.initialize();
    if (this.state.isPaused || this.state.isProcessing) return;
    this.processNextItem();
  }

  private async processNextItem(): Promise<void> {
    // Loop guard
    if (this.state.isPaused || this.state.items.length === 0) {
      this.state.isProcessing = false;
      this.notifyListeners();
      return;
    }

    // Strict concurrency limit: 1 because we only have 1 hidden WebView
    if (this.state.activeDownloads.size >= MAX_CONCURRENT_DOWNLOADS) {
      return;
    }

    this.state.isProcessing = true;
    const item = this.state.items.shift(); // Take from front
    if (!item) {
      this.state.isProcessing = false;
      return;
    }

    // Move to active
    const downloadItem: DownloadItem = {
      id: item.id,
      mangaId: item.mangaId,
      mangaTitle: item.mangaTitle,
      chapterNumber: item.chapterNumber,
      chapterUrl: item.chapterUrl,
      status: DownloadStatus.DOWNLOADING,
      progress: 0,
      totalImages: 0,
      downloadedImages: 0,
      createdAt: item.addedAt,
      updatedAt: Date.now(),
    };

    this.state.activeDownloads.set(item.id, downloadItem);
    this.scheduleSave();
    this.notifyListeners();

    try {
      await this.executeDownload(item);
    } catch (error) {
      console.error(`Download failed for ${item.id}`, error);
      this.state.activeDownloads.delete(item.id);
      // Optional: Retry logic? For now, just drop it or maybe add to back with lower priority
    } finally {
      this.state.activeDownloads.delete(item.id);
      this.scheduleSave();
      this.notifyListeners();

      // Next!
      this.state.isProcessing = false;
      // Small delay to let UI breathe and cleanup
      setTimeout(() => this.processNextItem(), 500);
    }
  }

  private async executeDownload(item: DownloadQueueItem): Promise<void> {
    // 1. Request WebView Interception
    const tokens = await this.requestWebViewTokens(item);

    // 2. Call DownloadManager
    const result =
      await downloadManagerService.downloadChapterFromInterceptedRequest(
        item.mangaId,
        item.chapterNumber,
        tokens.chapterId,
        tokens.vrfToken,
        item.chapterUrl,
        item.mangaTitle
      );

    if (!result.success) {
      throw new Error(result.error?.message || 'Download failed');
    }

    // Success!
    if (isDebugEnabled()) console.log(`Queue: Download success for ${item.id}`);
  }

  // --- WebView Coordination Logic ---

  private requestWebViewTokens(
    item: DownloadQueueItem
  ): Promise<{ chapterId: string; vrfToken: string }> {
    return new Promise((resolve, reject) => {
      // Set timeout for the whole process
      const timeout = setTimeout(() => {
        this.setActiveWebViewRequest(null);
        reject(new Error('WebView Token Interception Timeout'));
      }, 45000);

      this.currentDownloadResolver = (data) => {
        clearTimeout(timeout);
        resolve(data);
      };

      this.currentDownloadRejecter = (err) => {
        clearTimeout(timeout);
        reject(err);
      };

      this.setActiveWebViewRequest({
        id: item.id,
        mangaId: item.mangaId,
        chapterNumber: item.chapterNumber,
        url: item.chapterUrl,
        attempt: 1,
      });
    });
  }

  // Called by Host (UI)
  subscribeWebView(
    listener: (request: ActiveWebViewRequest | null) => void
  ): () => void {
    this.webViewListeners.add(listener);
    listener(this.activeWebViewRequest);
    return () => this.webViewListeners.delete(listener);
  }

  getActiveWebViewRequest(): ActiveWebViewRequest | null {
    return this.activeWebViewRequest;
  }

  // Called by Host (UI) when WebView succeeds
  handleWebViewIntercepted(chapterId: string, vrfToken: string) {
    this.setActiveWebViewRequest(null); // Hide WebView
    if (this.currentDownloadResolver) {
      this.currentDownloadResolver({ chapterId, vrfToken });
      this.currentDownloadResolver = null;
      this.currentDownloadRejecter = null;
    }
  }

  // Called by Host (UI) when WebView fails
  handleWebViewError(error: string) {
    this.setActiveWebViewRequest(null);
    if (this.currentDownloadRejecter) {
      this.currentDownloadRejecter(new Error(error));
      this.currentDownloadResolver = null;
      this.currentDownloadRejecter = null;
    }
  }

  private setActiveWebViewRequest(request: ActiveWebViewRequest | null) {
    this.activeWebViewRequest = request;
    this.webViewListeners.forEach((l) => l(request));
  }

  // --- Standard Public API ---

  async pauseQueue(): Promise<void> {
    await this.initialize();
    this.state.isPaused = true;
    this.scheduleSave();
    this.notifyListeners();
  }

  async resumeQueue(): Promise<void> {
    await this.initialize();
    this.state.isPaused = false;
    this.scheduleSave();
    this.notifyListeners();
    this.processQueue();
  }

  async pauseDownload(downloadId: string): Promise<void> {
    // For now, "pausing" a specific download in a strict queue means
    // maybe cancelling it and leaving it in queue?
    // Or just pausing the whole queue.
    // Current implementation in Manager pauses logic, but here we just update state.
    // Simplest:
    await downloadManagerService.pauseDownload(downloadId);
  }

  async resumeDownload(downloadId: string): Promise<void> {
    await downloadManagerService.resumeDownload(downloadId);
  }

  async cancelDownload(downloadId: string): Promise<void> {
    await downloadManagerService.cancelDownload(downloadId);
    // Also remove from items if present
    this.state.items = this.state.items.filter((i) => i.id !== downloadId);
    this.scheduleSave();
    this.notifyListeners();
  }

  async getQueueStatus(): Promise<QueueStatus> {
    await this.initialize();
    return this.getQueueStatusSync();
  }

  async getActiveDownloads(): Promise<DownloadItem[]> {
    await this.initialize();
    return Array.from(this.state.activeDownloads.values());
  }

  async getQueuedItems(): Promise<DownloadQueueItem[]> {
    await this.initialize();
    return [...this.state.items];
  }

  async getDownloadById(id: string): Promise<DownloadItem | null> {
    await this.initialize();
    return this.state.activeDownloads.get(id) || null;
  }

  async clearQueue(): Promise<void> {
    await this.initialize();
    this.state.items = [];
    this.scheduleSave();
    this.notifyListeners();
  }

  async clearCompleted(): Promise<void> {
    // No-op in new architecture, active downloads are cleared automatically
  }

  async clearCompletedDownloads(): Promise<void> {
    // No-op
  }

  async isInQueue(mangaId: string, chapterNumber: string): Promise<boolean> {
    await this.initialize();
    return (
      this.state.items.some(
        (i) => i.mangaId === mangaId && i.chapterNumber === chapterNumber
      ) ||
      Array.from(this.state.activeDownloads.values()).some(
        (i) => i.mangaId === mangaId && i.chapterNumber === chapterNumber
      )
    );
  }

  // Helpers for Manager to call back (Backward compat)
  async updateDownloadProgress(
    id: string,
    progress: number,
    dl: number,
    total: number
  ) {
    const item = this.state.activeDownloads.get(id);
    if (item) {
      item.progress = progress;
      item.downloadedImages = dl;
      item.totalImages = total;
      this.notifyListeners();
    }
  }

  async completeDownload(_id: string) {
    // Handled in executeDownload flow
  }

  async failDownload(_id: string, _error: string) {
    // Handled in executeDownload flow
  }

  async processQueueInBackground(): Promise<boolean> {
    await this.processQueue();
    // Return true if we have active downloads or items in queue
    return this.state.activeDownloads.size > 0 || this.state.items.length > 0;
  }

  async recoverFromAppRestart(): Promise<void> {
    await this.initialize();
  }

  async saveRecoveryData(): Promise<void> {
    await this.persistQueueForBackground();
  }

  async cleanup(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    this.listeners.clear();
  }

  addStatusListener(listener: (status: QueueStatus) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  removeStatusListener(listener: (status: QueueStatus) => void): void {
    this.listeners.delete(listener);
  }
}

export const downloadQueueService = DownloadQueueService.getInstance();
