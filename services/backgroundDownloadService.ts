import * as TaskManager from 'expo-task-manager';
import * as BackgroundFetch from 'expo-background-fetch';
import { AppState, AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { downloadQueueService } from './downloadQueue';
import { getDownloadSettings } from './settingsService';
import { isDebugEnabled } from '@/constants/env';

// Background task configuration
const BACKGROUND_DOWNLOAD_TASK = 'background-download-task';
const BACKGROUND_FETCH_INTERVAL = 15000; // 15 seconds minimum for iOS
const APP_STATE_KEY = 'app_background_state';
const BACKGROUND_SESSION_KEY = 'background_download_session';

interface BackgroundSession {
  startTime: number;
  lastActivity: number;
  downloadsProcessed: number;
  isActive: boolean;
}

interface BackgroundDownloadState {
  isRegistered: boolean;
  isEnabled: boolean;
  lastBackgroundTime: number;
  totalBackgroundSessions: number;
}

class BackgroundDownloadService {
  private static instance: BackgroundDownloadService;
  private state: BackgroundDownloadState;
  private currentSession: BackgroundSession | null = null;
  private appStateSubscription: any = null;
  private initialized: boolean = false;

  private constructor() {
    this.state = {
      isRegistered: false,
      isEnabled: false,
      lastBackgroundTime: 0,
      totalBackgroundSessions: 0,
    };
  }

  static getInstance(): BackgroundDownloadService {
    if (!BackgroundDownloadService.instance) {
      BackgroundDownloadService.instance = new BackgroundDownloadService();
    }
    return BackgroundDownloadService.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadState();
      await this.setupAppStateListener();
      await this.registerBackgroundTask();

      this.initialized = true;

      if (isDebugEnabled()) {
        console.log('Background download service initialized');
      }
    } catch (error) {
      console.error('Failed to initialize background download service:', error);
      throw error;
    }
  }

  private async loadState(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem(APP_STATE_KEY);
      if (stored) {
        this.state = { ...this.state, ...JSON.parse(stored) };
      }
    } catch (error) {
      console.error('Failed to load background service state:', error);
    }
  }

  private async saveState(): Promise<void> {
    try {
      await AsyncStorage.setItem(APP_STATE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.error('Failed to save background service state:', error);
    }
  }

  private async setupAppStateListener(): Promise<void> {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange.bind(this)
    );
  }

  private async handleAppStateChange(
    nextAppState: AppStateStatus
  ): Promise<void> {
    if (isDebugEnabled()) {
      console.log('App state changed to:', nextAppState);
    }

    if (nextAppState === 'background' || nextAppState === 'inactive') {
      await this.onAppBackground();
    } else if (nextAppState === 'active') {
      await this.onAppForeground();
    }
  }

  private async onAppBackground(): Promise<void> {
    this.state.lastBackgroundTime = Date.now();
    await this.saveState();

    // Start background session if downloads are pending
    const queueStatus = await downloadQueueService.getQueueStatus();
    if (queueStatus.queuedItems > 0 || queueStatus.activeDownloads > 0) {
      await this.startBackgroundSession();
    }

    if (isDebugEnabled()) {
      console.log('App went to background, background downloads may continue');
    }
  }

  private async onAppForeground(): Promise<void> {
    await this.endBackgroundSession();

    // Resume queue processing when app comes to foreground
    const queueStatus = await downloadQueueService.getQueueStatus();
    if (!queueStatus.isPaused) {
      await downloadQueueService.processQueue();
    }

    if (isDebugEnabled()) {
      console.log(
        'App came to foreground, resuming normal download processing'
      );
    }
  }

  private async startBackgroundSession(): Promise<void> {
    if (this.currentSession) {
      return; // Session already active
    }

    this.currentSession = {
      startTime: Date.now(),
      lastActivity: Date.now(),
      downloadsProcessed: 0,
      isActive: true,
    };

    await AsyncStorage.setItem(
      BACKGROUND_SESSION_KEY,
      JSON.stringify(this.currentSession)
    );

    this.state.totalBackgroundSessions++;
    await this.saveState();

    if (isDebugEnabled()) {
      console.log('Started background download session');
    }
  }

  private async endBackgroundSession(): Promise<void> {
    if (!this.currentSession) {
      return;
    }

    this.currentSession.isActive = false;

    const sessionDuration = Date.now() - this.currentSession.startTime;

    if (isDebugEnabled()) {
      console.log(
        `Ended background session. Duration: ${Math.round(sessionDuration / 1000)}s, Downloads processed: ${this.currentSession.downloadsProcessed}`
      );
    }

    this.currentSession = null;
    await AsyncStorage.removeItem(BACKGROUND_SESSION_KEY);
  }

  private async registerBackgroundTask(): Promise<void> {
    try {
      // Check if task is already registered
      const isRegistered = await TaskManager.isTaskRegisteredAsync(
        BACKGROUND_DOWNLOAD_TASK
      );

      if (!isRegistered) {
        // Define the background task
        TaskManager.defineTask(BACKGROUND_DOWNLOAD_TASK, async () => {
          try {
            return await this.executeBackgroundTask();
          } catch (error) {
            console.error('Background task execution failed:', error);
            return BackgroundFetch.BackgroundFetchResult.Failed;
          }
        });

        // Register the background fetch task
        await BackgroundFetch.registerTaskAsync(BACKGROUND_DOWNLOAD_TASK, {
          minimumInterval: BACKGROUND_FETCH_INTERVAL,
          stopOnTerminate: false,
          startOnBoot: true,
        });

        this.state.isRegistered = true;
        await this.saveState();

        if (isDebugEnabled()) {
          console.log('Background download task registered');
        }
      } else {
        this.state.isRegistered = true;
      }
    } catch (error) {
      console.error('Failed to register background task:', error);
      this.state.isRegistered = false;
    }
  }

  private async executeBackgroundTask(): Promise<BackgroundFetch.BackgroundFetchResult> {
    try {
      if (isDebugEnabled()) {
        console.log('Executing background download task');
      }

      // Update session activity
      if (this.currentSession) {
        this.currentSession.lastActivity = Date.now();
        await AsyncStorage.setItem(
          BACKGROUND_SESSION_KEY,
          JSON.stringify(this.currentSession)
        );
      }

      // Initialize download queue service if needed
      await downloadQueueService.initialize();

      // Get current queue status
      const queueStatus = await downloadQueueService.getQueueStatus();

      if (queueStatus.isPaused) {
        if (isDebugEnabled()) {
          console.log(
            'Download queue is paused, skipping background processing'
          );
        }
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      if (queueStatus.queuedItems === 0 && queueStatus.activeDownloads === 0) {
        if (isDebugEnabled()) {
          console.log('No downloads in queue, background task complete');
        }
        return BackgroundFetch.BackgroundFetchResult.NoData;
      }

      // Process the download queue in background mode
      const madeProgress =
        await downloadQueueService.processQueueInBackground();

      // Update session stats
      if (this.currentSession && madeProgress) {
        this.currentSession.downloadsProcessed++;
      }

      if (isDebugEnabled()) {
        const newQueueStatus = await downloadQueueService.getQueueStatus();
        console.log(
          `Background task processed. Queue: ${newQueueStatus.queuedItems}, Active: ${newQueueStatus.activeDownloads}, Progress: ${madeProgress}`
        );
      }

      return madeProgress
        ? BackgroundFetch.BackgroundFetchResult.NewData
        : BackgroundFetch.BackgroundFetchResult.NoData;
    } catch (error) {
      console.error('Background task execution error:', error);
      return BackgroundFetch.BackgroundFetchResult.Failed;
    }
  }

  async enableBackgroundDownloads(): Promise<void> {
    await this.initialize();

    // Check user preferences
    const downloadSettings = await getDownloadSettings();
    if (!downloadSettings.enableBackgroundDownloads) {
      if (isDebugEnabled()) {
        console.log('Background downloads disabled in user preferences');
      }
      return;
    }

    if (!this.state.isRegistered) {
      await this.registerBackgroundTask();
    }

    this.state.isEnabled = true;
    await this.saveState();

    if (isDebugEnabled()) {
      console.log('Background downloads enabled');
    }
  }

  async disableBackgroundDownloads(): Promise<void> {
    await this.initialize();

    this.state.isEnabled = false;
    await this.saveState();

    // Unregister the background task
    try {
      await BackgroundFetch.unregisterTaskAsync(BACKGROUND_DOWNLOAD_TASK);
      this.state.isRegistered = false;
      await this.saveState();

      if (isDebugEnabled()) {
        console.log('Background downloads disabled and task unregistered');
      }
    } catch (error) {
      console.error('Failed to unregister background task:', error);
    }
  }

  async isBackgroundDownloadsEnabled(): Promise<boolean> {
    await this.initialize();
    return this.state.isEnabled && this.state.isRegistered;
  }

  async getBackgroundDownloadStatus(): Promise<{
    isEnabled: boolean;
    isRegistered: boolean;
    lastBackgroundTime: number;
    totalBackgroundSessions: number;
    currentSession: BackgroundSession | null;
  }> {
    await this.initialize();

    return {
      isEnabled: this.state.isEnabled,
      isRegistered: this.state.isRegistered,
      lastBackgroundTime: this.state.lastBackgroundTime,
      totalBackgroundSessions: this.state.totalBackgroundSessions,
      currentSession: this.currentSession,
    };
  }

  // Queue persistence methods for app restart recovery
  async persistQueueState(): Promise<void> {
    try {
      const queueStatus = await downloadQueueService.getQueueStatus();
      const activeDownloads = await downloadQueueService.getActiveDownloads();
      const queuedItems = await downloadQueueService.getQueuedItems();

      const persistedState = {
        queueStatus,
        activeDownloads,
        queuedItems,
        timestamp: Date.now(),
      };

      await AsyncStorage.setItem(
        'persisted_queue_state',
        JSON.stringify(persistedState)
      );

      if (isDebugEnabled()) {
        console.log('Queue state persisted for app restart recovery');
      }
    } catch (error) {
      console.error('Failed to persist queue state:', error);
    }
  }

  async restoreQueueState(): Promise<void> {
    try {
      const stored = await AsyncStorage.getItem('persisted_queue_state');
      if (!stored) {
        return;
      }

      const persistedState = JSON.parse(stored);
      const timeSinceLastSave = Date.now() - persistedState.timestamp;

      // Only restore if the state is relatively recent (within 1 hour)
      if (timeSinceLastSave > 60 * 60 * 1000) {
        await AsyncStorage.removeItem('persisted_queue_state');
        return;
      }

      // Restore queued items
      for (const queueItem of persistedState.queuedItems) {
        await downloadQueueService.addToQueue(queueItem);
      }

      // Handle active downloads - they need to be restarted
      for (const activeDownload of persistedState.activeDownloads) {
        if (activeDownload.status === 'downloading') {
          // Convert back to queue item to restart
          const queueItem = {
            id: activeDownload.id,
            mangaId: activeDownload.mangaId,
            mangaTitle: activeDownload.mangaTitle,
            chapterNumber: activeDownload.chapterNumber,
            chapterUrl: activeDownload.chapterUrl,
            priority: 1, // Default priority for restarted downloads
            addedAt: activeDownload.createdAt,
          };

          await downloadQueueService.addToQueue(queueItem);
        }
      }

      // Clean up the persisted state
      await AsyncStorage.removeItem('persisted_queue_state');

      if (isDebugEnabled()) {
        console.log('Queue state restored after app restart');
      }
    } catch (error) {
      console.error('Failed to restore queue state:', error);
    }
  }

  // Cleanup method
  async cleanup(): Promise<void> {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    await this.endBackgroundSession();

    if (this.state.isRegistered) {
      try {
        await BackgroundFetch.unregisterTaskAsync(BACKGROUND_DOWNLOAD_TASK);
      } catch (error) {
        console.error(
          'Failed to unregister background task during cleanup:',
          error
        );
      }
    }

    this.initialized = false;

    if (isDebugEnabled()) {
      console.log('Background download service cleaned up');
    }
  }

  // Development and debugging methods
  async getBackgroundTaskStatus(): Promise<{
    isRegistered: boolean;
    status: BackgroundFetch.BackgroundFetchStatus;
  }> {
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(
        BACKGROUND_DOWNLOAD_TASK
      );
      const status = await BackgroundFetch.getStatusAsync();

      return {
        isRegistered,
        status: status ?? BackgroundFetch.BackgroundFetchStatus.Denied,
      };
    } catch (error) {
      console.error('Failed to get background task status:', error);
      return {
        isRegistered: false,
        status: BackgroundFetch.BackgroundFetchStatus.Denied,
      };
    }
  }

  async triggerBackgroundTask(): Promise<void> {
    if (isDebugEnabled()) {
      console.log('Manually triggering background task for testing');
      await this.executeBackgroundTask();
    }
  }
}

// Export singleton instance
export const backgroundDownloadService =
  BackgroundDownloadService.getInstance();
