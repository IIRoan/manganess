import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect, useRef, useState } from 'react';
import { useColorScheme, StatusBar } from 'react-native';
import { ThemeProvider, useTheme } from '../constants/ThemeContext';
import ErrorBoundary from '../components/ErrorBoundary';
import { isDebugEnabled } from '@/constants/env';
import { enableAsyncStorageLogging } from '@/utils/asyncStorageMonitor';
import { installNetworkMonitor } from '@/utils/networkMonitor';
import { useNavigationPerf } from '@/hooks/useNavigationPerf';
import { logger } from '@/utils/logger';
import Constants from 'expo-constants';
import { preloadBookmarkSummaries } from '@/services/bookmarkService';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  // Track route change durations globally
  useNavigationPerf();
  const { theme } = useTheme();
  const colorScheme = useColorScheme();
  const activeTheme = theme === 'system' ? colorScheme : theme;

  return (
    <>
      <StatusBar translucent backgroundColor="transparent" />

      <NavigationThemeProvider
        value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}
      >
        <ErrorBoundary>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen
              name="cloudflare"
              options={{
                headerShown: true,
                title: 'Cloudflare Verification',
                presentation: 'modal',
              }}
            />
          </Stack>
        </ErrorBoundary>
      </NavigationThemeProvider>
    </>
  );
}

export default function RootLayout() {
  const [bookmarksReady, setBookmarksReady] = useState(false);
  const splashHiddenRef = useRef(false);
  useEffect(() => {
    if (!isDebugEnabled()) return;
    enableAsyncStorageLogging();
    installNetworkMonitor();
    const log = logger();
    log.info('UI', '🔧 Debug enabled', {
      debug: true,
      sdkVersion: (Constants as any)?.expoConfig?.sdkVersion,
      appVersion: (Constants as any)?.expoConfig?.version,
    });
  }, []);
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    let isActive = true;

    preloadBookmarkSummaries()
      .catch((error: unknown) => {
        if (isDebugEnabled()) {
          console.warn('Failed to preload bookmark summaries', error);
        }
      })
      .finally(() => {
        if (isActive) {
          setBookmarksReady(true);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!loaded || !bookmarksReady || splashHiddenRef.current) {
      return;
    }

    splashHiddenRef.current = true;
    SplashScreen.hideAsync().catch((error: unknown) => {
      if (isDebugEnabled()) {
        console.warn('Failed to hide splash screen', error);
      }
    });
  }, [loaded, bookmarksReady]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ThemeProvider>
        <RootLayoutNav />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
