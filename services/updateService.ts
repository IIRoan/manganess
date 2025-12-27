import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { logger } from '@/utils/logger';

// ============================================================================
// Types
// ============================================================================

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
  updateId?: string;
  isNew?: boolean;
}

export interface UpdateOptions {
  silent?: boolean;
  forceReload?: boolean;
}

export interface UpdateInfo {
  channel: string | null;
  runtimeVersion: string | null;
  updateId: string | null;
  createdAt: Date | null;
  isEmbeddedLaunch: boolean;
  isEmergencyLaunch: boolean;
  checkAutomatically: string;
}

// ============================================================================
// Environment Detection
// ============================================================================

/**
 * Check if running in Expo Go
 */
export const isExpoGo = (): boolean => {
  return Constants.executionEnvironment === ExecutionEnvironment.StoreClient;
};

/**
 * Check if running in development mode
 */
export const isDevelopment = (): boolean => {
  return __DEV__;
};

/**
 * Check if updates are available in the current environment
 */
export const areUpdatesAvailable = (): boolean => {
  // Updates not available in dev mode, Expo Go, or web
  if (isDevelopment()) return false;
  if (isExpoGo()) return false;
  if (Platform.OS === 'web') return false;
  return true;
};

/**
 * Get a human-readable reason why updates aren't available
 */
export const getUnavailableReason = (): string | null => {
  if (isDevelopment()) {
    return 'Updates are not available in development mode';
  }
  if (isExpoGo()) {
    return 'Updates are not available in Expo Go. Use a development or production build.';
  }
  if (Platform.OS === 'web') {
    return 'Updates are not available on web platform';
  }
  return null;
};

// ============================================================================
// Update Lock (prevents duplicate simultaneous checks)
// ============================================================================

let isUpdateInProgress = false;

/**
 * Acquire the update lock
 * Returns true if lock was acquired, false if already locked
 */
const acquireUpdateLock = (): boolean => {
  if (isUpdateInProgress) {
    logger().debug('Service', 'Update already in progress, skipping');
    return false;
  }
  isUpdateInProgress = true;
  return true;
};

/**
 * Release the update lock
 */
const releaseUpdateLock = (): void => {
  isUpdateInProgress = false;
};

/**
 * Check if an update operation is currently in progress
 */
export const isUpdateLocked = (): boolean => {
  return isUpdateInProgress;
};

// ============================================================================
// Update Information
// ============================================================================

/**
 * Get current update information
 */
export const getUpdateInfo = (): UpdateInfo => {
  return {
    channel: Updates.channel,
    runtimeVersion: Updates.runtimeVersion,
    updateId: Updates.updateId,
    createdAt: Updates.createdAt,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
    isEmergencyLaunch: Updates.isEmergencyLaunch,
    checkAutomatically: Updates.checkAutomatically || 'UNKNOWN',
  };
};

// ============================================================================
// Core Update Functions
// ============================================================================

/**
 * Checks if an update is available from Expo's update server
 */
export const checkForUpdate = async (): Promise<UpdateResult> => {
  // Check environment first
  const unavailableReason = getUnavailableReason();
  if (unavailableReason) {
    return {
      success: false,
      message: unavailableReason,
    };
  }

  try {
    logger().info('Service', 'Checking for updates', {
      channel: Updates.channel,
      runtimeVersion: Updates.runtimeVersion,
    });

    const update = await Updates.checkForUpdateAsync();

    if (update.isAvailable) {
      logger().info('Service', 'Update available', {
        manifestId: update.manifest?.id,
      });
      return {
        success: true,
        message: 'Update available',
        updateId: update.manifest?.id,
      };
    } else {
      logger().debug('Service', 'No update available');
      return {
        success: false,
        message: 'App is up to date',
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger().error('Service', 'Error checking for update', {
      error: errorMessage,
      channel: Updates.channel,
    });
    return {
      success: false,
      message: `Error checking for updates: ${errorMessage}`,
    };
  }
};

/**
 * Downloads the latest update from Expo's update server
 * Returns whether the downloaded update is new
 */
export const downloadUpdate = async (): Promise<UpdateResult> => {
  // Check environment first
  const unavailableReason = getUnavailableReason();
  if (unavailableReason) {
    return {
      success: false,
      message: unavailableReason,
    };
  }

  try {
    logger().info('Service', 'Downloading update');
    const result = await Updates.fetchUpdateAsync();

    if (result.isNew) {
      logger().info('Service', 'New update downloaded successfully');
      return {
        success: true,
        message: 'Update downloaded successfully',
        isNew: true,
      };
    } else {
      logger().debug('Service', 'Downloaded update is not new');
      return {
        success: true,
        message: 'Update downloaded (not new)',
        isNew: false,
      };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger().error('Service', 'Error downloading update', { error: errorMessage });
    return {
      success: false,
      message: `Error downloading update: ${errorMessage}`,
    };
  }
};

/**
 * Applies the update and restarts the app
 */
export const applyUpdate = async (): Promise<UpdateResult> => {
  // Check environment first
  const unavailableReason = getUnavailableReason();
  if (unavailableReason) {
    return {
      success: false,
      message: unavailableReason,
    };
  }

  try {
    logger().info('Service', 'Reloading app with update');
    await Updates.reloadAsync();

    // This line won't be reached as the app will reload
    return {
      success: true,
      message: 'Update applied successfully',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger().error('Service', 'Error applying update', { error: errorMessage });
    return {
      success: false,
      message: `Error applying update: ${errorMessage}`,
    };
  }
};

// ============================================================================
// Full Update Flow
// ============================================================================

/**
 * Performs the complete update flow: check, download, and optionally apply
 * Uses a lock to prevent duplicate simultaneous operations
 */
export const performFullUpdateFlow = async (
  options: UpdateOptions = {},
  onStatusChange?: (status: UpdateStatus) => void
): Promise<UpdateResult> => {
  const { silent = false, forceReload = false } = options;

  // Try to acquire the lock
  if (!acquireUpdateLock()) {
    return {
      success: false,
      message: 'Update already in progress',
    };
  }

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
    // Check environment first
    const unavailableReason = getUnavailableReason();
    if (unavailableReason) {
      updateState({ error: silent ? null : unavailableReason });
      return {
        success: false,
        message: unavailableReason,
      };
    }

    // Check for update
    updateState({ isChecking: true });
    logger().info('Service', 'Starting update flow', { silent, forceReload });

    const update = await Updates.checkForUpdateAsync();

    if (!update.isAvailable) {
      updateState({ isChecking: false });
      logger().debug('Service', 'No update available in flow');
      return {
        success: false,
        message: 'App is up to date',
      };
    }

    updateState({
      isChecking: false,
      isUpdateAvailable: true,
    });

    logger().info('Service', 'Update found, downloading', {
      manifestId: update.manifest?.id,
    });

    // Download update
    updateState({ isDownloading: true });
    const fetchResult = await Updates.fetchUpdateAsync();

    if (!fetchResult.isNew) {
      updateState({
        isDownloading: false,
        error: silent ? null : 'Downloaded update is not new',
      });
      logger().debug('Service', 'Fetched update is not new');
      return {
        success: false,
        message: 'Downloaded update is not new',
      };
    }

    updateState({
      isDownloading: false,
      isReady: true,
    });

    logger().info('Service', 'Update ready to apply');

    // Apply update immediately if forceReload is true
    if (forceReload) {
      logger().info('Service', 'Force reloading with update');
      await Updates.reloadAsync();
      return {
        success: true,
        message: 'Update applied successfully',
      };
    }

    return {
      success: true,
      message: 'Update is ready to be applied',
      updateId: update.manifest?.id,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    updateState({
      isChecking: false,
      isDownloading: false,
      isReady: false,
      error: silent ? null : errorMessage,
    });

    logger().error('Service', 'Update flow failed', { error: errorMessage });

    return {
      success: false,
      message: `Update failed: ${errorMessage}`,
    };
  } finally {
    // Always release the lock
    releaseUpdateLock();
  }
};

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Check and download update in one call (without applying)
 * This is optimized to only call checkForUpdateAsync once
 */
export const checkAndDownloadUpdate = async (
  onStatusChange?: (status: UpdateStatus) => void
): Promise<UpdateResult> => {
  return performFullUpdateFlow({ forceReload: false }, onStatusChange);
};

/**
 * Check, download, and apply update in one call
 */
export const checkDownloadAndApplyUpdate = async (
  onStatusChange?: (status: UpdateStatus) => void
): Promise<UpdateResult> => {
  return performFullUpdateFlow({ forceReload: true, silent: true }, onStatusChange);
};
