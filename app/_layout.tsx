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
import React, { useEffect } from 'react';
import { useColorScheme, StatusBar, Button } from 'react-native';
import { ThemeProvider, useTheme } from '../constants/ThemeContext';
import ErrorBoundary from '../components/ErrorBoundary';
import BatchDownloadHost from '@/components/BatchDownloadHost';
import { OfflineProvider } from '@/contexts/OfflineContext';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { isDebugEnabled } from '@/constants/env';
import { enableAsyncStorageLogging } from '@/utils/asyncStorageMonitor';
import { installNetworkMonitor } from '@/utils/networkMonitor';
import { useNavigationPerf } from '@/hooks/useNavigationPerf';
import { logger } from '@/utils/logger';
import Constants from 'expo-constants';
import { downloadManagerService } from '@/services/downloadManager';
import * as Sentry from '@sentry/react-native';

Sentry.init({
  dsn: 'https://7bcd6652c918fd0f44f3d78deafa1ab9@o4510380885082112.ingest.de.sentry.io/4510380894060624',

  // Adds more context data to events (IP address, cookies, user, etc.)
  // For more information, visit: https://docs.sentry.io/platforms/react-native/data-management/data-collected/
  sendDefaultPii: true,

  // Enable Logs
  enableLogs: true,

  // uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: __DEV__,
});

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
            <Stack.Screen
              name="downloads"
              options={{
                headerShown: false,
                title: 'Downloads',
              }}
            />
          </Stack>
        </ErrorBoundary>
        <BatchDownloadHost />
      </NavigationThemeProvider>
    </>
  );
}

export default Sentry.wrap(function RootLayout() {
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

  useEffect(() => {
    downloadManagerService
      .restorePausedDownloadsAutomatically()
      .catch((error) => {
        if (!isDebugEnabled()) {
          return;
        }

        const log = logger();
        log.error('UI', 'Failed to restore paused downloads', {
          error: error instanceof Error ? error.message : String(error),
        });
      });
  }, []);
  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }}>
      <ThemeProvider>
        <OfflineProvider>
          <RootLayoutNav />
          
          <OfflineIndicator />

        </OfflineProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
});
