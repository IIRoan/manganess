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

// Queue configuration
const QUEUE_STORAGE_KEY = 'download_queue';
const MAX_CONCURRENT_DOWNLOADS = 3;
const QUEUE_PROCESSING_INTERVAL = 1000; // 1 second

interface QueueState {
  items: DownloadQueueItem[];
  activeDownloads: Map<string, DownloadItem>;
  isPaused: boolean;
  isProcessing: boolean;
}

interface PersistedQueueData {
  items: DownloadQueueItem[];
  isPaused: boolean;
  lastProcessed: number;
}

class DownloadQueueService implements DownloadQueue {
  private static instance: DownloadQueueService;
  private state: QueueState;
  private initialized: boolean = false;
  private processingTimer: any = null;
  private saveTimer: any = null;
  private static readonly SAVE_DEBOUNCE_MS = 2000;

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
      // Set initialized flag immediately to prevent multiple calls
      this.initialized = true;

      // Load queue data asynchronously without blocking
      this.loadQueueFromStorage().catch((error) => {
        console.error('Failed to load queue from storage:', error);
      });

      await this.setupAppStateHandling();

      if (isDebugEnabled()) {
        console.log('Download queue service initialized');
      }

      // Start processing in next tick to avoid blocking
      setTimeout(() => {
        if (!this.state.isPaused && this.state.items.length > 0) {
          this.startProcessing().catch((error) => {
            console.error('Failed to start queue processing:', error);
          });
        }
      }, 100);
    } catch (error) {
      this.initialized = false; // Reset on error
      console.error('Failed to initialize download queue:', error);
      throw error;
    }
  }

  private async setupAppStateHandling(): Promise<void> {
    // Listen for app state changes to handle background/foreground transitions
    AppState.addEventListener('change', this.handleAppStateChange.bind(this));
  }

  private async handleAppStateChange(
    nextAppState: AppStateStatus
  ): Promise<void> {
    if (nextAppState === 'background') {
      // Persist queue state when going to background
      await this.persistQueueForBackground();
    } else if (nextAppState === 'active') {
      // Restore and resume processing when coming to foreground
      await this.restoreFromBackground();
    }
  }

  private async persistQueueForBackground(): Promise<void> {
    try {
      // Save current state with timestamp
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

      if (isDebugEnabled()) {
        console.log('Queue state persisted for background operation');
      }
    } catch (error) {
      console.error('Failed to persist queue for background:', error);
    }
  }

  private async restoreFromBackground(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('queue_background_state');
      if (!stored) return;

      const backgroundState = JSON.parse(stored);
      const timeSinceBackground =
        Date.now() - backgroundState.backgroundTimestamp;

      // If app was in background for more than 5 minutes, restart active downloads
      if (timeSinceBackground > 5 * 60 * 1000) {
        // Convert active downloads back to queue items
        for (const [, download] of backgroundState.activeDownloads) {
          if (download.status === DownloadStatus.DOWNLOADING) {
            const queueItem: DownloadQueueItem = {
              id: download.id,
              mangaId: download.mangaId,
              mangaTitle: download.mangaTitle,
              chapterNumber: download.chapterNumber,
              chapterUrl: download.chapterUrl,
              priority: 1,
              addedAt: download.createdAt,
            };

            // Add back to queue if not already present
            const exists = this.state.items.some(
              (item) => item.id === queueItem.id
            );
            if (!exists) {
              this.state.items.push(queueItem);
            }
          }
        }

        // Clear active downloads as they need to be restarted
        this.state.activeDownloads.clear();
        this.sortQueueByPriority();
      } else {
        // Restore active downloads if background time was short
        for (const [id, download] of backgroundState.activeDownloads) {
          this.state.activeDownloads.set(id, download);
        }
      }

      // Clean up background state
      await AsyncStorage.removeItem('queue_background_state');

      if (isDebugEnabled()) {
        console.log('Queue state restored from background');
      }
    } catch (error) {
      console.error('Failed to restore from background:', error);
    }
  }

  private async loadQueueFromStorage(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(QUEUE_STORAGE_KEY);
      if (stored) {
        const data: PersistedQueueData = JSON.parse(stored);
        this.state.items = data.items || [];
        this.state.isPaused = data.isPaused || false;

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
      const data: PersistedQueueData = {
        items: this.state.items,
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
      totalItems: this.state.items.length,
      activeDownloads: this.state.activeDownloads.size,
      queuedItems: this.state.items.length,
      isPaused: this.state.isPaused,
      isProcessing: this.state.isProcessing,
    };
  }

  async addToQueue(item: DownloadQueueItem): Promise<void> {
    await this.initialize();

    // Check if item already exists in queue
    const existingIndex = this.state.items.findIndex(
      (queueItem) =>
        queueItem.mangaId === item.mangaId &&
        queueItem.chapterNumber === item.chapterNumber
    );

    if (existingIndex !== -1) {
      // Update existing item with new priority if higher
      if (item.priority > (this.state.items[existingIndex]?.priority ?? 0)) {
        this.state.items[existingIndex] = { ...item };
        this.sortQueueByPriority();
      }
      return;
    }

    // Add new item to queue
    this.state.items.push(item);
    this.sortQueueByPriority();

    this.scheduleSave();
    this.notifyListeners();

    if (isDebugEnabled()) {
      console.log(
        `Added chapter ${item.chapterNumber} of ${item.mangaTitle} to download queue`
      );
    }

    // Start processing if not paused
    if (!this.state.isPaused) {
      await this.startProcessing();
    }
  }

  private sortQueueByPriority(): void {
    this.state.items.sort((a, b) => {
      // Higher priority first, then by added time (FIFO for same priority)
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

    const removed = this.state.items.length < initialLength;

    if (removed) {
      this.scheduleSave();
      this.notifyListeners();

      if (isDebugEnabled()) {
        console.log(
          `Removed chapter ${chapterNumber} of manga ${mangaId} from queue`
        );
      }
    }

    return removed;
  }

  async processQueue(): Promise<void> {
    await this.initialize();

    if (this.state.isPaused || this.state.isProcessing) {
      return;
    }

    await this.startProcessing();
  }

  private async startProcessing(): Promise<void> {
    if (this.state.isProcessing || this.state.isPaused) {
      return;
    }

    this.state.isProcessing = true;
    this.notifyListeners();

    if (isDebugEnabled()) {
      console.log('Starting download queue processing');
    }

    // Start the processing loop
    this.processingTimer = setInterval(async () => {
      try {
        await this.processNextItems();
      } catch (error) {
        console.error('Error in queue processing:', error);
      }
    }, QUEUE_PROCESSING_INTERVAL);
  }

  private async processNextItems(): Promise<void> {
    if (this.state.isPaused || this.state.items.length === 0) {
      await this.stopProcessing();
      return;
    }

    const availableSlots =
      MAX_CONCURRENT_DOWNLOADS - this.state.activeDownloads.size;

    if (availableSlots <= 0) {
      return; // All slots are busy
    }

    // Get next items to process
    const itemsToProcess = this.state.items.slice(0, availableSlots);

    for (const queueItem of itemsToProcess) {
      try {
        await this.startDownload(queueItem);
      } catch (error) {
        console.error(`Failed to start download for ${queueItem.id}:`, error);
        // Remove failed item from queue
        await this.removeFromQueue(queueItem.mangaId, queueItem.chapterNumber);
      }
    }
  }

  private async startDownload(queueItem: DownloadQueueItem): Promise<void> {
    // Create download item
    const downloadItem: DownloadItem = {
      id: queueItem.id,
      mangaId: queueItem.mangaId,
      mangaTitle: queueItem.mangaTitle,
      chapterNumber: queueItem.chapterNumber,
      chapterUrl: queueItem.chapterUrl,
      status: DownloadStatus.DOWNLOADING,
      progress: 0,
      totalImages: 0,
      downloadedImages: 0,
      createdAt: queueItem.addedAt,
      updatedAt: Date.now(),
    };

    // Add to active downloads
    this.state.activeDownloads.set(queueItem.id, downloadItem);

    // Remove from queue
    this.state.items = this.state.items.filter(
      (item) => item.id !== queueItem.id
    );

    this.scheduleSave();
    this.notifyListeners();

    if (isDebugEnabled()) {
      console.log(`Started download for chapter ${queueItem.chapterNumber}`);
    }

    // TODO: This will be implemented when we create the download manager
    // For now, we'll simulate the download process
    this.simulateDownload(downloadItem);
  }

  private simulateDownload(downloadItem: DownloadItem): void {
    // This is a placeholder simulation - will be replaced with actual download manager integration
    setTimeout(() => {
      // Simulate completion
      downloadItem.status = DownloadStatus.COMPLETED;
      downloadItem.progress = 100;
      downloadItem.updatedAt = Date.now();

      // Remove from active downloads
      this.state.activeDownloads.delete(downloadItem.id);
      this.notifyListeners();

      if (isDebugEnabled()) {
        console.log(`Simulated completion of download ${downloadItem.id}`);
      }
    }, 5000); // 5 second simulation
  }

  async pauseQueue(): Promise<void> {
    await this.initialize();

    this.state.isPaused = true;
    await this.stopProcessing();

    this.scheduleSave();
    this.notifyListeners();

    if (isDebugEnabled()) {
      console.log('Download queue paused');
    }
  }

  async resumeQueue(): Promise<void> {
    await this.initialize();

    this.state.isPaused = false;
    this.scheduleSave();
    this.notifyListeners();

    if (isDebugEnabled()) {
      console.log('Download queue resumed');
    }

    // Start processing if there are items in queue
    if (this.state.items.length > 0) {
      await this.startProcessing();
    }
  }

  private async stopProcessing(): Promise<void> {
    this.state.isProcessing = false;

    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
    }

    this.notifyListeners();

    if (isDebugEnabled()) {
      console.log('Download queue processing stopped');
    }
  }

  async pauseDownload(downloadId: string): Promise<void> {
    await this.initialize();

    const downloadItem = this.state.activeDownloads.get(downloadId);
    if (downloadItem) {
      downloadItem.status = DownloadStatus.PAUSED;
      downloadItem.updatedAt = Date.now();

      // TODO: Implement actual download pause logic when download manager is available

      this.notifyListeners();

      if (isDebugEnabled()) {
        console.log(`Paused download ${downloadId}`);
      }
    }
  }

  async resumeDownload(downloadId: string): Promise<void> {
    await this.initialize();

    const downloadItem = this.state.activeDownloads.get(downloadId);
    if (downloadItem && downloadItem.status === DownloadStatus.PAUSED) {
      downloadItem.status = DownloadStatus.DOWNLOADING;
      downloadItem.updatedAt = Date.now();

      // TODO: Implement actual download resume logic when download manager is available

      this.notifyListeners();

      if (isDebugEnabled()) {
        console.log(`Resumed download ${downloadId}`);
      }
    }
  }

  async cancelDownload(downloadId: string): Promise<void> {
    await this.initialize();

    const downloadItem = this.state.activeDownloads.get(downloadId);
    if (downloadItem) {
      downloadItem.status = DownloadStatus.CANCELLED;
      downloadItem.updatedAt = Date.now();

      // Remove from active downloads
      this.state.activeDownloads.delete(downloadId);

      // TODO: Implement actual download cancellation logic when download manager is available

      this.scheduleSave();
      this.notifyListeners();

      if (isDebugEnabled()) {
        console.log(`Cancelled download ${downloadId}`);
      }
    }
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

  async clearQueue(): Promise<void> {
    await this.initialize();

    this.state.items = [];
    this.scheduleSave();
    this.notifyListeners();

    if (isDebugEnabled()) {
      console.log('Download queue cleared');
    }
  }

  async clearCompleted(): Promise<void> {
    await this.initialize();

    // Remove completed downloads from active downloads
    const completedIds: string[] = [];
    for (const [id, download] of this.state.activeDownloads.entries()) {
      if (
        download.status === DownloadStatus.COMPLETED ||
        download.status === DownloadStatus.FAILED ||
        download.status === DownloadStatus.CANCELLED
      ) {
        completedIds.push(id);
      }
    }

    completedIds.forEach((id) => {
      this.state.activeDownloads.delete(id);
    });

    if (completedIds.length > 0) {
      this.notifyListeners();

      if (isDebugEnabled()) {
        console.log(`Cleared ${completedIds.length} completed downloads`);
      }
    }
  }

  async clearCompletedDownloads(): Promise<void> {
    return this.clearCompleted();
  }

  // Event listener management
  addStatusListener(listener: (status: QueueStatus) => void): () => void {
    this.listeners.add(listener);

    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  removeStatusListener(listener: (status: QueueStatus) => void): void {
    this.listeners.delete(listener);
  }

  // Utility methods
  async getDownloadById(downloadId: string): Promise<DownloadItem | null> {
    await this.initialize();
    return this.state.activeDownloads.get(downloadId) || null;
  }

  async isInQueue(mangaId: string, chapterNumber: string): Promise<boolean> {
    await this.initialize();

    return (
      this.state.items.some(
        (item) =>
          item.mangaId === mangaId && item.chapterNumber === chapterNumber
      ) ||
      Array.from(this.state.activeDownloads.values()).some(
        (download) =>
          download.mangaId === mangaId &&
          download.chapterNumber === chapterNumber
      )
    );
  }

  async updateDownloadProgress(
    downloadId: string,
    progress: number,
    downloadedImages: number,
    totalImages: number
  ): Promise<void> {
    await this.initialize();

    const downloadItem = this.state.activeDownloads.get(downloadId);
    if (downloadItem) {
      downloadItem.progress = progress;
      downloadItem.downloadedImages = downloadedImages;
      downloadItem.totalImages = totalImages;
      downloadItem.updatedAt = Date.now();

      this.notifyListeners();
    }
  }

  async completeDownload(downloadId: string): Promise<void> {
    await this.initialize();

    const downloadItem = this.state.activeDownloads.get(downloadId);
    if (downloadItem) {
      downloadItem.status = DownloadStatus.COMPLETED;
      downloadItem.progress = 100;
      downloadItem.updatedAt = Date.now();

      // Keep in active downloads for a while so UI can show completion
      // Will be cleaned up by clearCompleted() or automatically after some time

      this.notifyListeners();

      if (isDebugEnabled()) {
        console.log(`Completed download ${downloadId}`);
      }
    }
  }

  async failDownload(downloadId: string, error: string): Promise<void> {
    await this.initialize();

    const downloadItem = this.state.activeDownloads.get(downloadId);
    if (downloadItem) {
      downloadItem.status = DownloadStatus.FAILED;
      downloadItem.error = error;
      downloadItem.updatedAt = Date.now();

      this.notifyListeners();

      if (isDebugEnabled()) {
        console.log(`Failed download ${downloadId}: ${error}`);
      }
    }
  }

  // Background task integration methods
  async processQueueInBackground(): Promise<boolean> {
    if (this.state.isPaused || this.state.items.length === 0) {
      return false;
    }

    try {
      const initialQueueSize = this.state.items.length;
      const initialActiveCount = this.state.activeDownloads.size;

      await this.processNextItems();

      // Return true if we made progress
      const madeProgress =
        this.state.items.length < initialQueueSize ||
        this.state.activeDownloads.size > initialActiveCount;

      return madeProgress;
    } catch (error) {
      console.error('Error processing queue in background:', error);
      return false;
    }
  }

  async getBackgroundProcessingStatus(): Promise<{
    canProcess: boolean;
    queuedItems: number;
    activeDownloads: number;
    isPaused: boolean;
  }> {
    return {
      canProcess: !this.state.isPaused && this.state.items.length > 0,
      queuedItems: this.state.items.length,
      activeDownloads: this.state.activeDownloads.size,
      isPaused: this.state.isPaused,
    };
  }

  // App restart recovery methods
  async recoverFromAppRestart(): Promise<void> {
    try {
      // Check for any persisted active downloads that need to be restarted
      const stored = await AsyncStorage.getItem('active_downloads_recovery');
      if (stored) {
        const recoveryData = JSON.parse(stored);
        const timeSinceLastSave = Date.now() - recoveryData.timestamp;

        // Only recover if data is recent (within 30 minutes)
        if (timeSinceLastSave < 30 * 60 * 1000) {
          for (const download of recoveryData.activeDownloads) {
            // Convert back to queue item
            const queueItem: DownloadQueueItem = {
              id: download.id,
              mangaId: download.mangaId,
              mangaTitle: download.mangaTitle,
              chapterNumber: download.chapterNumber,
              chapterUrl: download.chapterUrl,
              priority: 2, // Higher priority for recovered downloads
              addedAt: download.createdAt,
            };

            await this.addToQueue(queueItem);
          }

          if (isDebugEnabled()) {
            console.log(
              `Recovered ${recoveryData.activeDownloads.length} downloads from app restart`
            );
          }
        }

        // Clean up recovery data
        await AsyncStorage.removeItem('active_downloads_recovery');
      }
    } catch (error) {
      console.error('Failed to recover from app restart:', error);
    }
  }

  async saveRecoveryData(): Promise<void> {
    try {
      if (this.state.activeDownloads.size > 0) {
        const recoveryData = {
          activeDownloads: Array.from(this.state.activeDownloads.values()),
          timestamp: Date.now(),
        };

        await AsyncStorage.setItem(
          'active_downloads_recovery',
          JSON.stringify(recoveryData)
        );
      }
    } catch (error) {
      console.error('Failed to save recovery data:', error);
    }
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    await this.stopProcessing();

    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }

    // Save recovery data before cleanup
    await this.saveRecoveryData();

    // Save final state
    await this.saveQueueToStorage();

    this.listeners.clear();
    this.initialized = false;

    if (isDebugEnabled()) {
      console.log('Download queue service cleaned up');
    }
  }
}

// Export singleton instance
export const downloadQueueService = DownloadQueueService.getInstance();
