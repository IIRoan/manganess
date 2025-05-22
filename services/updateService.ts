import * as Updates from 'expo-updates';
import { Platform } from 'react-native';

export interface UpdateStatus {
  isChecking: boolean;
  isUpdateAvailable: boolean;
  isDownloading: boolean;
  isReady: boolean;
  error: string | null;
}

export interface UpdateResult {
  success: boolean;
  message: string;
}

export interface UpdateOptions {
  silent?: boolean;
  forceReload?: boolean;
}

/**
 * Checks if an update is available from Expo's update server
 */
export const checkForUpdate = async (): Promise<UpdateResult> => {
  try {
    if (__DEV__) {
      return {
        success: false,
        message: 'Updates are not available in development mode',
      };
    }

    console.log('Checking for updates...');
    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      return {
        success: true,
        message: 'Update available',
      };
    } else {
      return {
        success: false,
        message: 'App is up to date',
      };
    }
  } catch (error) {
    console.error('Error checking for update:', error);
    return {
      success: false,
      message: `Error checking for updates: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Downloads the latest update from Expo's update server
 */
export const downloadUpdate = async (): Promise<UpdateResult> => {
  try {
    if (__DEV__) {
      return {
        success: false,
        message: 'Cannot download updates in development mode',
      };
    }

    console.log('Downloading update...');
    await Updates.fetchUpdateAsync();
    return {
      success: true,
      message: 'Update downloaded successfully',
    };
  } catch (error) {
    console.error('Error downloading update:', error);
    return {
      success: false,
      message: `Error downloading update: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Applies the update and restarts the app
 */
export const applyUpdate = async (): Promise<UpdateResult> => {
  try {
    if (__DEV__ || Platform.OS === 'web') {
      return {
        success: false,
        message: 'Cannot apply updates in development or web mode',
      };
    }

    console.log('Reloading app with update...');
    await Updates.reloadAsync();

    return {
      success: true,
      message: 'Update applied successfully',
    };
  } catch (error) {
    console.error('Error applying update:', error);
    return {
      success: false,
      message: `Error applying update: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
};

/**
 * Performs the complete update flow: check, download, and apply
 * Can run silently in the background with optional immediate reload
 */
export const performFullUpdateFlow = async (
  options: UpdateOptions = {},
  onStatusChange?: (status: UpdateStatus) => void
): Promise<UpdateResult> => {
  const { silent = false, forceReload = false } = options;

  const updateStatus: UpdateStatus = {
    isChecking: false,
    isUpdateAvailable: false,
    isDownloading: false,
    isReady: false,
    error: null,
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
        error: silent ? null : checkResult.message,
      });
      return checkResult;
    }

    updateState({
      isChecking: false,
      isUpdateAvailable: true,
    });

    // Download update
    updateState({ isDownloading: true });
    const downloadResult = await downloadUpdate();

    if (!downloadResult.success) {
      updateState({
        isDownloading: false,
        error: silent ? null : downloadResult.message,
      });
      return downloadResult;
    }

    updateState({
      isDownloading: false,
      isReady: true,
    });

    // Apply update immediately if forceReload is true
    if (forceReload) {
      return await applyUpdate();
    }

    return {
      success: true,
      message: 'Update is ready to be applied',
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    updateState({
      isChecking: false,
      isDownloading: false,
      isReady: false,
      error: silent ? null : errorMessage,
    });

    return {
      success: false,
      message: `Update failed: ${errorMessage}`,
    };
  }
};
