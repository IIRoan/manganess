import { downloadQueueService } from './downloadQueue';
import { backgroundDownloadService } from './backgroundDownloadService';
import { isDebugEnabled } from '@/constants/env';

/**
 * Integration service that connects the download queue with background processing
 * This service manages the coordination between foreground and background download operations
 */
class DownloadBackgroundIntegration {
  private static instance: DownloadBackgroundIntegration;
  private initialized: boolean = false;

  private constructor() {}

  static getInstance(): DownloadBackgroundIntegration {
    if (!DownloadBackgroundIntegration.instance) {
      DownloadBackgroundIntegration.instance =
        new DownloadBackgroundIntegration();
    }
    return DownloadBackgroundIntegration.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Initialize both services
      await Promise.all([
        downloadQueueService.initialize(),
        backgroundDownloadService.initialize(),
      ]);

      // Recover any downloads that were interrupted by app restart
      await downloadQueueService.recoverFromAppRestart();
      await backgroundDownloadService.restoreQueueState();

      this.initialized = true;

      if (isDebugEnabled()) {
        console.log('Download background integration initialized');
      }
    } catch (error) {
      console.error(
        'Failed to initialize download background integration:',
        error
      );
      throw error;
    }
  }

  async enableBackgroundDownloads(): Promise<void> {
    await this.initialize();
    await backgroundDownloadService.enableBackgroundDownloads();

    if (isDebugEnabled()) {
      console.log('Background downloads enabled through integration service');
    }
  }

  async disableBackgroundDownloads(): Promise<void> {
    await this.initialize();
    await backgroundDownloadService.disableBackgroundDownloads();

    if (isDebugEnabled()) {
      console.log('Background downloads disabled through integration service');
    }
  }

  async isBackgroundDownloadsEnabled(): Promise<boolean> {
    await this.initialize();
    return await backgroundDownloadService.isBackgroundDownloadsEnabled();
  }

  async getIntegratedStatus(): Promise<{
    backgroundEnabled: boolean;
    queueStatus: any;
    backgroundStatus: any;
  }> {
    await this.initialize();

    const [backgroundEnabled, queueStatus, backgroundStatus] =
      await Promise.all([
        backgroundDownloadService.isBackgroundDownloadsEnabled(),
        downloadQueueService.getQueueStatus(),
        backgroundDownloadService.getBackgroundDownloadStatus(),
      ]);

    return {
      backgroundEnabled,
      queueStatus,
      backgroundStatus,
    };
  }

  async processDownloadsInBackground(): Promise<boolean> {
    await this.initialize();

    try {
      // Check if background processing is enabled
      const isEnabled =
        await backgroundDownloadService.isBackgroundDownloadsEnabled();
      if (!isEnabled) {
        return false;
      }

      // Process the queue in background mode
      return await downloadQueueService.processQueueInBackground();
    } catch (error) {
      console.error('Error processing downloads in background:', error);
      return false;
    }
  }

  async handleAppRestart(): Promise<void> {
    await this.initialize();

    try {
      // This method should be called when the app starts up
      // It will restore any interrupted downloads and resume processing

      if (isDebugEnabled()) {
        console.log('Handling app restart - restoring download state');
      }

      // The initialization already handles recovery, but we can add additional logic here
      const queueStatus = await downloadQueueService.getQueueStatus();

      if (queueStatus.queuedItems > 0) {
        // Resume processing if there are queued items
        await downloadQueueService.processQueue();

        if (isDebugEnabled()) {
          console.log(
            `Resumed processing ${queueStatus.queuedItems} queued downloads after app restart`
          );
        }
      }
    } catch (error) {
      console.error('Error handling app restart:', error);
    }
  }

  async prepareForAppBackground(): Promise<void> {
    await this.initialize();

    try {
      // Persist current state before app goes to background
      await Promise.all([
        downloadQueueService.saveRecoveryData(),
        backgroundDownloadService.persistQueueState(),
      ]);

      if (isDebugEnabled()) {
        console.log('Prepared download state for app backgrounding');
      }
    } catch (error) {
      console.error('Error preparing for app background:', error);
    }
  }

  async cleanup(): Promise<void> {
    if (!this.initialized) return;

    try {
      await Promise.all([
        downloadQueueService.cleanup(),
        backgroundDownloadService.cleanup(),
      ]);

      this.initialized = false;

      if (isDebugEnabled()) {
        console.log('Download background integration cleaned up');
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }

  // Utility methods for testing and debugging
  async getDetailedStatus(): Promise<{
    integration: {
      initialized: boolean;
      backgroundEnabled: boolean;
    };
    queue: {
      totalItems: number;
      activeDownloads: number;
      isPaused: boolean;
      isProcessing: boolean;
    };
    background: {
      isEnabled: boolean;
      isRegistered: boolean;
      lastBackgroundTime: number;
      totalBackgroundSessions: number;
    };
  }> {
    await this.initialize();

    const [queueStatus, backgroundStatus] = await Promise.all([
      downloadQueueService.getQueueStatus(),
      backgroundDownloadService.getBackgroundDownloadStatus(),
    ]);

    return {
      integration: {
        initialized: this.initialized,
        backgroundEnabled:
          await backgroundDownloadService.isBackgroundDownloadsEnabled(),
      },
      queue: queueStatus,
      background: backgroundStatus,
    };
  }

  async triggerBackgroundProcessing(): Promise<void> {
    if (isDebugEnabled()) {
      console.log('Manually triggering background processing for testing');
      await backgroundDownloadService.triggerBackgroundTask();
    }
  }
}

// Export singleton instance
export const downloadBackgroundIntegration =
  DownloadBackgroundIntegration.getInstance();
