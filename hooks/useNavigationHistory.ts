import { useRouter } from 'expo-router';
import { useCallback } from 'react';
import { NavigationState } from '@/types/navigation';

export function useNavigationHistory() {
  const router = useRouter();

  const handleBackPress = useCallback(
    (_source?: string) => {
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/');
      }
    },
    [router]
  );

  const canGoBack = router.canGoBack();
  const currentDepth = 1; // Simplified

  const navigationState: NavigationState = {
    contextHistory: [],
    currentDepth: 1,
  };

  const settings = {
    swipeSensitivity: 0.5,
    enableGestures: true,
  };

  return {
    handleBackPress,
    canGoBack,
    currentDepth,
    navigationState,
    settings,
  };
}
