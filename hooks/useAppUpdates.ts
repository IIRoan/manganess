import { useState, useCallback } from 'react';
import {
  UpdateStatus,
  UpdateResult,
  UpdateOptions,
  UpdateInfo,
  performFullUpdateFlow,
  applyUpdate,
  checkForUpdate as checkForUpdateService,
  areUpdatesAvailable,
  getUnavailableReason,
  isUpdateLocked,
  getUpdateInfo,
  checkDownloadAndApplyUpdate,
} from '@/services/updateService';
import { logger } from '@/utils/logger';

export interface UseAppUpdatesReturn {
  // State
  updateStatus: UpdateStatus;
  lastResult: UpdateResult | null;
  updateInfo: UpdateInfo;

  // Computed
  isUpdateInProgress: boolean;
  areUpdatesAvailable: boolean;
  unavailableReason: string | null;

  // Actions
  checkForUpdate: () => Promise<UpdateResult>;
  checkAndDownload: (options?: UpdateOptions) => Promise<UpdateResult>;
  applyReadyUpdate: () => Promise<UpdateResult>;
  updateAndReload: () => Promise<UpdateResult>;
  refreshUpdateInfo: () => void;
}

export function useAppUpdates(): UseAppUpdatesReturn {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    isChecking: false,
    isUpdateAvailable: false,
    isDownloading: false,
    isReady: false,
    error: null,
  });

  const [lastResult, setLastResult] = useState<UpdateResult | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo>(getUpdateInfo());

  // Refresh update info from the service
  const refreshUpdateInfo = useCallback(() => {
    setUpdateInfo(getUpdateInfo());
  }, []);

  // Check if an update is available without downloading
  const checkForUpdate = useCallback(async (): Promise<UpdateResult> => {
    // Check if updates are even available in this environment
    if (!areUpdatesAvailable()) {
      const reason = getUnavailableReason() || 'Updates not available';
      const result: UpdateResult = { success: false, message: reason };
      setLastResult(result);
      return result;
    }

    // Check if an update is already in progress
    if (isUpdateLocked()) {
      const result: UpdateResult = {
        success: false,
        message: 'Update check already in progress',
      };
      setLastResult(result);
      return result;
    }

    setUpdateStatus((prev) => ({ ...prev, isChecking: true, error: null }));

    try {
      logger().debug('Service', 'Checking for available updates...');
      const result = await checkForUpdateService();

      setUpdateStatus((prev) => ({
        ...prev,
        isChecking: false,
        isUpdateAvailable: result.success,
      }));

      setLastResult(result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger().error('Service', 'Error checking for update', { error: errorMessage });

      setUpdateStatus((prev) => ({
        ...prev,
        isChecking: false,
        error: errorMessage,
      }));

      const errorResult: UpdateResult = {
        success: false,
        message: `Error checking for updates: ${errorMessage}`,
      };

      setLastResult(errorResult);
      return errorResult;
    }
  }, []);

  // Check, download, and potentially apply an update
  // This uses performFullUpdateFlow which handles everything in one optimized call
  const checkAndDownload = useCallback(
    async (options: UpdateOptions = {}): Promise<UpdateResult> => {
      // Check if updates are even available in this environment
      if (!areUpdatesAvailable()) {
        const reason = getUnavailableReason() || 'Updates not available';
        const result: UpdateResult = { success: false, message: reason };
        setLastResult(result);
        return result;
      }

      try {
        logger().debug('Service', 'Starting update flow', { options });
        const result = await performFullUpdateFlow(options, setUpdateStatus);
        setLastResult(result);
        return result;
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        logger().error('Service', 'Error in update flow', { error: errorMessage });

        const errorResult: UpdateResult = {
          success: false,
          message: `Update process failed: ${errorMessage}`,
        };
        setLastResult(errorResult);
        return errorResult;
      }
    },
    []
  );

  // Apply an already downloaded update
  const applyReadyUpdate = useCallback(async (): Promise<UpdateResult> => {
    if (!updateStatus.isReady) {
      logger().debug('Service', 'No update is ready to apply');
      const noUpdateResult: UpdateResult = {
        success: false,
        message: 'No update is ready to apply',
      };
      setLastResult(noUpdateResult);
      return noUpdateResult;
    }

    try {
      logger().info('Service', 'Applying ready update...');
      const result = await applyUpdate();
      setLastResult(result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger().error('Service', 'Error applying update', { error: errorMessage });

      const errorResult: UpdateResult = {
        success: false,
        message: `Failed to apply update: ${errorMessage}`,
      };
      setLastResult(errorResult);
      return errorResult;
    }
  }, [updateStatus.isReady]);

  // Check for update, download, and apply immediately
  // This is the most common use case for background updates
  const updateAndReload = useCallback(async (): Promise<UpdateResult> => {
    // Check if updates are even available in this environment
    if (!areUpdatesAvailable()) {
      const reason = getUnavailableReason() || 'Updates not available';
      const result: UpdateResult = { success: false, message: reason };
      setLastResult(result);
      return result;
    }

    try {
      logger().info('Service', 'Starting update and reload process...');
      const result = await checkDownloadAndApplyUpdate(setUpdateStatus);
      setLastResult(result);
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger().error('Service', 'Error during update and reload', { error: errorMessage });

      const errorResult: UpdateResult = {
        success: false,
        message: `Update and reload failed: ${errorMessage}`,
      };
      setLastResult(errorResult);
      return errorResult;
    }
  }, []);

  const isUpdateInProgress = updateStatus.isChecking || updateStatus.isDownloading;

  return {
    // State
    updateStatus,
    lastResult,
    updateInfo,

    // Computed
    isUpdateInProgress,
    areUpdatesAvailable: areUpdatesAvailable(),
    unavailableReason: getUnavailableReason(),

    // Actions
    checkForUpdate,
    checkAndDownload,
    applyReadyUpdate,
    updateAndReload,
    refreshUpdateInfo,
  };
}
