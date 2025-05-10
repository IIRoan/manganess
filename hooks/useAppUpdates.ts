import { useState, useCallback } from 'react';
import { 
  UpdateStatus, 
  UpdateResult, 
  performFullUpdateFlow,
  applyUpdate,
  UpdateOptions
} from '@/services/updateService';

export function useAppUpdates() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    isChecking: false,
    isUpdateAvailable: false,
    isDownloading: false,
    isReady: false,
    error: null
  });

  const [lastResult, setLastResult] = useState<UpdateResult | null>(null);

  // Check and potentially download an update
  const checkForUpdate = useCallback(async (options: UpdateOptions = {}) => {
    const result = await performFullUpdateFlow(options, setUpdateStatus);
    setLastResult(result);
    return result;
  }, []);

  // Apply an already downloaded update
  const applyReadyUpdate = useCallback(async () => {
    if (updateStatus.isReady) {
      const result = await applyUpdate();
      return result;
    }
    return {
      success: false,
      message: 'No update is ready to apply'
    };
  }, [updateStatus.isReady]);

  // Check for update, download, and apply immediately
  const updateAndReload = useCallback(async () => {
    const result = await performFullUpdateFlow({
      silent: true,
      forceReload: true
    }, setUpdateStatus);
    setLastResult(result);
    return result;
  }, []);

  const isUpdateInProgress = updateStatus.isChecking || updateStatus.isDownloading;

  return {
    updateStatus,
    lastResult,
    checkForUpdate,
    applyReadyUpdate,
    updateAndReload,
    isUpdateInProgress
  };
}