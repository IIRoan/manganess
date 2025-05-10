import { useState, useCallback } from 'react';
import {
  UpdateStatus,
  UpdateResult,
  performFullUpdateFlow,
  applyUpdate,
  UpdateOptions,
  checkForUpdate as checkForUpdateService
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
  
  // Check if an update is available without downloading
  const checkForUpdate = useCallback(async (options: UpdateOptions = {}) => {
    setUpdateStatus(prev => ({ ...prev, isChecking: true }));
    try {
      console.log('Checking for available updates...');
      const result = await checkForUpdateService();
      
      setUpdateStatus(prev => ({
        ...prev,
        isChecking: false,
        isUpdateAvailable: result.success
      }));
      
      setLastResult(result);
      return result;
    } catch (error) {
      console.error('Error checking for update:', error);
      setUpdateStatus(prev => ({
        ...prev,
        isChecking: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
      
      const errorResult = {
        success: false,
        message: `Error checking for updates: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
      
      setLastResult(errorResult);
      return errorResult;
    }
  }, []);
  
  // Check, download, and potentially apply an update
  const checkAndDownload = useCallback(async (options: UpdateOptions = {}) => {
    try {
      console.log('Starting update flow with options:', options);
      const result = await performFullUpdateFlow(options, setUpdateStatus);
      setLastResult(result);
      return result;
    } catch (error) {
      console.error('Error in update flow:', error);
      const errorResult = {
        success: false,
        message: `Update process failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
      setLastResult(errorResult);
      return errorResult;
    }
  }, []);
  
  // Apply an already downloaded update
  const applyReadyUpdate = useCallback(async () => {
    if (updateStatus.isReady) {
      try {
        console.log('Applying ready update...');
        const result = await applyUpdate();
        setLastResult(result);
        return result;
      } catch (error) {
        console.error('Error applying update:', error);
        const errorResult = {
          success: false,
          message: `Failed to apply update: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
        setLastResult(errorResult);
        return errorResult;
      }
    }
    
    console.log('No update is ready to apply');
    const noUpdateResult = {
      success: false,
      message: 'No update is ready to apply'
    };
    
    setLastResult(noUpdateResult);
    return noUpdateResult;
  }, [updateStatus.isReady]);
  
  // Check for update, download, and apply immediately
  const updateAndReload = useCallback(async () => {
    try {
      console.log('Starting update and reload process...');
      const result = await performFullUpdateFlow({
        silent: true,
        forceReload: true
      }, setUpdateStatus);
      
      setLastResult(result);
      return result;
    } catch (error) {
      console.error('Error during update and reload:', error);
      const errorResult = {
        success: false,
        message: `Update and reload failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
      setLastResult(errorResult);
      return errorResult;
    }
  }, []);
  
  const isUpdateInProgress = updateStatus.isChecking || updateStatus.isDownloading;
  
  return {
    updateStatus,
    lastResult,
    checkForUpdate,
    checkAndDownload,
    applyReadyUpdate,
    updateAndReload,
    isUpdateInProgress
  };
}