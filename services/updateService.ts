import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

export interface UpdateStatus {
  isChecking: boolean;
  isUpdateAvailable: boolean;
  isDownloading: boolean;
  countdown: number | null;
  error: string | null;
}

export interface UpdateResult {
  success: boolean;
  message: string;
}

/**
 * Checks if an update is available from Expo's update server
 * @returns Promise resolving to UpdateResult with update availability info
 */
export const checkForUpdate = async (): Promise<UpdateResult> => {
  try {
    // Skip update check in development mode
    if (__DEV__) {
      return { 
        success: false, 
        message: 'Updates are not available in development mode' 
      };
    }

    // Ensure the app is using Expo Updates
    if (!Updates.isEmbeddedLaunch) {
      return { 
        success: false, 
        message: 'Updates are not available in Expo Go' 
      };
    }

    console.log('Checking for updates...');
    const update = await Updates.checkForUpdateAsync();
    
    if (update.isAvailable) {
      return { 
        success: true, 
        message: 'Update available' 
      };
    } else {
      return { 
        success: false, 
        message: 'App is up to date' 
      };
    }
  } catch (error) {
    console.error('Error checking for update:', error);
    return { 
      success: false, 
      message: `Error checking for updates: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
};

/**
 * Downloads the latest update from Expo's update server
 * @returns Promise resolving to UpdateResult with download status
 */
export const downloadUpdate = async (): Promise<UpdateResult> => {
  try {
    // Make sure we're not in development mode
    if (__DEV__) {
      return { 
        success: false, 
        message: 'Cannot download updates in development mode' 
      };
    }

    console.log('Downloading update...');
    await Updates.fetchUpdateAsync();
    return { 
      success: true, 
      message: 'Update downloaded successfully' 
    };
  } catch (error) {
    console.error('Error downloading update:', error);
    return { 
      success: false, 
      message: `Error downloading update: ${error instanceof Error ? error.message : 'Unknown error'}` 
    };
  }
};

/**
 * Applies the downloaded update and restarts the app with countdown
 * @param seconds Number of seconds to count down before restarting
 * @param onTick Callback fired each second during countdown
 * @returns Promise resolving when countdown completes
 */
export const applyUpdateWithCountdown = (
  seconds: number = 5,
  onTick?: (secondsRemaining: number) => void
): Promise<void> => {
  return new Promise((resolve) => {
    let countdown = seconds;
    
    // Start the countdown
    const intervalId = setInterval(() => {
      countdown -= 1;
      
      // Call the onTick callback with the current countdown value
      if (onTick) {
        onTick(countdown);
      }
      
      // When countdown reaches zero, clear the interval and restart
      if (countdown <= 0) {
        clearInterval(intervalId);
        
        // Check if we're on a native platform and not in development mode
        if (!__DEV__ && Platform.OS !== 'web') {
          Updates.reloadAsync()
            .catch(error => {
              console.error('Error reloading app:', error);
            });
        }
        
        resolve();
      }
    }, 1000);
  });
};

/**
 * Performs the complete update flow: check, download, and apply with countdown
 * @param countdownSeconds Number of seconds for the countdown
 * @param onStatusChange Callback fired on status changes
 * @returns Promise resolving to final UpdateResult
 */
export const performFullUpdateFlow = async (
  countdownSeconds: number = 5,
  onStatusChange?: (status: UpdateStatus) => void
): Promise<UpdateResult> => {
  const updateStatus: UpdateStatus = {
    isChecking: false,
    isUpdateAvailable: false,
    isDownloading: false,
    countdown: null,
    error: null
  };

  // Helper to update status
  const updateState = (updates: Partial<UpdateStatus>) => {
    Object.assign(updateStatus, updates);
    if (onStatusChange) {
      onStatusChange({ ...updateStatus });
    }
  };

  try {
    // Check for update
    updateState({ isChecking: true });
    const checkResult = await checkForUpdate();
    
    if (!checkResult.success) {
      updateState({ 
        isChecking: false,
        error: checkResult.message 
      });
      return checkResult;
    }
    
    updateState({ 
      isChecking: false,
      isUpdateAvailable: true 
    });
    
    // Download update
    updateState({ isDownloading: true });
    const downloadResult = await downloadUpdate();
    
    if (!downloadResult.success) {
      updateState({ 
        isDownloading: false,
        error: downloadResult.message 
      });
      return downloadResult;
    }
    
    updateState({ isDownloading: false });
    
    // Start countdown and apply update
    updateState({ countdown: countdownSeconds });
    
    await applyUpdateWithCountdown(
      countdownSeconds,
      (secondsRemaining) => {
        updateState({ countdown: secondsRemaining });
      }
    );
    
    return {
      success: true,
      message: 'Update applied successfully'
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateState({
      isChecking: false,
      isDownloading: false,
      countdown: null,
      error: errorMessage
    });
    
    return {
      success: false,
      message: `Update failed: ${errorMessage}`
    };
  }
};