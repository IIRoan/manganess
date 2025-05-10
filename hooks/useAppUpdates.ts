import { useState, useCallback } from 'react';
import { 
  UpdateStatus, 
  UpdateResult, 
  performFullUpdateFlow 
} from '@/services/updateService';

export function useAppUpdates() {
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({
    isChecking: false,
    isUpdateAvailable: false,
    isDownloading: false,
    countdown: null,
    error: null
  });

  const [lastResult, setLastResult] = useState<UpdateResult | null>(null);

  const checkAndApplyUpdate = useCallback(async (countdownSeconds = 5) => {
    const result = await performFullUpdateFlow(countdownSeconds, setUpdateStatus);
    setLastResult(result);
    return result;
  }, []);

  const isUpdateInProgress = updateStatus.isChecking || 
    updateStatus.isDownloading || 
    updateStatus.countdown !== null;

  return {
    updateStatus,
    lastResult,
    checkAndApplyUpdate,
    isUpdateInProgress
  };
}