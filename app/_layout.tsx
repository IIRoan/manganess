import 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from 'expo-router/react-navigation';
import { useFonts } from 'expo-font';
import { Stack, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useState } from 'react';
import { useColorScheme, StatusBar } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import ErrorBoundary from '../components/ErrorBoundary';
import BatchDownloadHost from '@/components/BatchDownloadHost';
import MangaFireVrfHost from '@/components/MangaFireVrfHost';
import { OfflineIndicator } from '@/components/OfflineIndicator';
import { isDebugEnabled } from '@/constants/env';
import { enableAsyncStorageLogging } from '@/utils/asyncStorageMonitor';
import { installNetworkMonitor } from '@/utils/networkMonitor';
import { useNavigationPerf } from '@/hooks/useNavigationPerf';
import { logger } from '@/utils/logger';
import { errorLogService } from '@/services/errorLogService';
import { useMarkInteractive } from '@/hooks/useMarkInteractive';
import Constants from 'expo-constants';
import { downloadManagerService } from '@/services/downloadManager';
import { createEcosystem, EcosystemProvider } from '@zedux/react';
import { StartupMigrationHost } from '@/components/StartupMigrationHost';
import { AppUpdateHost } from '@/components/AppUpdateHost';

SplashScreen.preventAutoHideAsync();
errorLogService.installGlobalHandlers();

function RootLayoutNav() {
  // Track route change durations globally
  useNavigationPerf();
  const { theme } = useTheme();
  const colorScheme = useColorScheme();
  const activeTheme = theme === 'system' ? colorScheme : theme;
  const pathname = usePathname();

  // Ensure status bar is always visible on non-chapter pages
  const isChapterPage = pathname.includes('/chapter/');

  useEffect(() => {
    if (!isChapterPage) {
      // Force status bar to be visible on all non-chapter pages
      StatusBar.setHidden(false);
      StatusBar.setTranslucent(true);
      StatusBar.setBackgroundColor('transparent');
    }
  }, [isChapterPage, pathname]);

  return (
    <>
      <StatusBar translucent backgroundColor="transparent" hidden={false} />
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
        <MangaFireVrfHost />
      </NavigationThemeProvider>
    </>
  );
}

export default function RootLayout() {
  // Create Zedux ecosystem with DevTools enabled in debug mode
  const ecosystem = useMemo(
    () =>
      createEcosystem({
        id: 'manganess',
        flags: isDebugEnabled() ? ['@@devtools'] : [],
      }),
    []
  );

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
  const [isInteractive, setIsInteractive] = useState(false);
  useMarkInteractive(isInteractive, { from: 'appStart', metric: 'app.tti' });

  useEffect(() => {
    if (!loaded) {
      return;
    }
    void SplashScreen.hideAsync().finally(() => {
      setIsInteractive(true);
    });
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: 'transparent' }}>
      <EcosystemProvider ecosystem={ecosystem}>
        <RootLayoutNav />
        <OfflineIndicator />
        <StartupMigrationHost />
        <AppUpdateHost />
      </EcosystemProvider>
    </GestureHandlerRootView>
  );
}
