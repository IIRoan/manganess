import { useEffect, useCallback, useState } from 'react';
import { usePathname, useRouter } from 'expo-router';
import navigationService from '@/services/navigationHistoryService';
import { NavigationState, NavigationSettings } from '@/types/navigation';

export const useNavigationHistory = () => {
  const pathname = usePathname();
  const router = useRouter();
  const [navigationState, setNavigationState] = useState<NavigationState>({
    canGoBack: false,
    canGoForward: false,
    currentDepth: 0,
    contextHistory: [],
    breadcrumbs: [],
    suggestions: [],
  });
  const [settings, setSettings] = useState<NavigationSettings | null>(null);

  const handleBackPress = useCallback(
    async (gestureType: 'tap' | 'swipe' = 'tap') => {
      try {
        const previousRoute =
          await navigationService.getPreviousRoute(pathname);

        // Record gesture usage
        await navigationService.recordGestureUsage(
          gestureType === 'swipe' ? 'swipeBack' : 'tapBack'
        );

        router.replace(previousRoute as any);
      } catch (error) {
        console.error('Error handling back press:', error);
        router.replace('/mangasearch' as any);
      }
    },
    [pathname, router]
  );

  const navigateTo = useCallback(
    async (
      path: string,
      options?: {
        title?: string;
        metadata?: any;
        replace?: boolean;
      }
    ) => {
      try {
        // Add to history with optional metadata
        await navigationService.addToHistory(path, {
          title: options?.title,
          metadata: options?.metadata,
        });

        if (options?.replace) {
          router.replace(path as any);
        } else {
          router.push(path as any);
        }
      } catch (error) {
        console.error('Error navigating:', error);
      }
    },
    [router]
  );

  const navigateToBreadcrumb = useCallback(
    async (path: string) => {
      try {
        await navigationService.recordGestureUsage('breadcrumbUsage');
        router.replace(path as any);
      } catch (error) {
        console.error('Error navigating via breadcrumb:', error);
      }
    },
    [router]
  );

  const clearHistory = useCallback(async () => {
    try {
      await navigationService.clearHistory();
      // Refresh navigation state
      const newState = await navigationService.getNavigationState(pathname);
      setNavigationState(newState);
    } catch (error) {
      console.error('Error clearing history:', error);
    }
  }, [pathname]);

  const updateSettings = useCallback(
    async (newSettings: Partial<NavigationSettings>) => {
      try {
        await navigationService.updateSettings(newSettings);
        const updatedSettings = await navigationService.getSettings();
        setSettings(updatedSettings);
      } catch (error) {
        console.error('Error updating settings:', error);
      }
    },
    []
  );

  const getAnalytics = useCallback(async () => {
    try {
      return await navigationService.getAnalytics();
    } catch (error) {
      console.error('Error getting analytics:', error);
      return null;
    }
  }, []);

  // Update navigation state when pathname changes
  useEffect(() => {
    const updateState = async () => {
      try {
        // Add current path to history
        await navigationService.addToHistory(pathname);

        // Get updated navigation state
        const state = await navigationService.getNavigationState(pathname);
        setNavigationState(state);
      } catch (error) {
        console.error('Error updating navigation state:', error);
      }
    };

    updateState();
  }, [pathname]);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const currentSettings = await navigationService.getSettings();
        setSettings(currentSettings);
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    };

    loadSettings();
  }, []);

  return {
    // Navigation actions
    handleBackPress,
    navigateTo,
    navigateToBreadcrumb,
    clearHistory,

    // Settings management
    updateSettings,

    // Analytics
    getAnalytics,

    // State
    navigationState,
    settings,

    // Computed values
    canGoBack: navigationState.canGoBack,
    breadcrumbs: navigationState.breadcrumbs,
    suggestions: navigationState.suggestions,
    currentDepth: navigationState.currentDepth,
  };
};
