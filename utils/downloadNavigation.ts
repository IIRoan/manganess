import { router } from 'expo-router';

/**
 * Navigation utilities for download-related screens
 */
export class DownloadNavigation {
  /**
   * Navigate to the downloads management screen
   */
  static navigateToDownloads(): void {
    router.push('/downloads');
  }

  /**
   * Navigate to downloads with a specific filter or state
   * @param filter Optional filter to apply (e.g., 'active', 'completed', 'failed')
   */
  static navigateToDownloadsWithFilter(filter?: string): void {
    if (filter) {
      router.push(`/downloads?filter=${filter}`);
    } else {
      router.push('/downloads');
    }
  }

  /**
   * Check if downloads screen is currently active
   */
  static isDownloadsScreenActive(): boolean {
    // This would need to be implemented based on the current route
    // For now, we'll return false as a placeholder
    return false;
  }
}

/**
 * Hook to provide download navigation utilities
 */
export const useDownloadNavigation = () => {
  return {
    navigateToDownloads: DownloadNavigation.navigateToDownloads,
    navigateToDownloadsWithFilter:
      DownloadNavigation.navigateToDownloadsWithFilter,
    isDownloadsScreenActive: DownloadNavigation.isDownloadsScreenActive,
  };
};
