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
import { Platform, useColorScheme, StatusBar } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Colors, type ColorScheme } from '@/constants/Colors';
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
import {
  NATIVE_STACK_SCREEN_OPTIONS,
  shouldForceRootStatusBarVisible,
} from '@/constants/navigation';

SplashScreen.preventAutoHideAsync();
errorLogService.installGlobalHandlers();

function RootLayoutNav() {
  // Track route change durations globally
  useNavigationPerf();
  const { theme } = useTheme();
  const colorScheme = useColorScheme();
  const activeTheme = theme === 'system' ? colorScheme : theme;
  const colorSchemeName: ColorScheme =
    activeTheme === 'light' ? 'light' : 'dark';
  const stackBackground = Colors[colorSchemeName].card;
  const pathname = usePathname();

  // Chapter pages own status-bar visibility from reader controls. This layout
  // only restores it when leaving a chapter — never hides it from above.
  const showRootStatusBar = shouldForceRootStatusBarVisible(pathname);

  useEffect(() => {
    if (!showRootStatusBar) {
      return;
    }
    StatusBar.setHidden(false);
    if (Platform.OS === 'android') {
      StatusBar.setTranslucent(true);
      StatusBar.setBackgroundColor('transparent');
    }
  }, [showRootStatusBar]);

  return (
    <>
      {showRootStatusBar ? (
        <StatusBar translucent backgroundColor="transparent" hidden={false} />
      ) : null}
      <NavigationThemeProvider
        value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}
      >
        <ErrorBoundary>
          <Stack
            screenOptions={{
              ...NATIVE_STACK_SCREEN_OPTIONS,
              contentStyle: { backgroundColor: stackBackground },
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="manga/[id]" />
            <Stack.Screen
              name="manga/[id]/chapter/[chapterNumber]"
              getId={({ params }) => {
                // One reader screen per manga so next/prev updates in place
                // instead of stacking animated chapter pages.
                const mangaId = params?.id;
                return typeof mangaId === 'string' && mangaId
                  ? `reader-${mangaId}`
                  : undefined;
              }}
            />
            <Stack.Screen
              name="cloudflare"
              options={{
                headerShown: true,
                title: 'Cloudflare Verification',
                presentation: 'modal',
              }}
            />
            <Stack.Screen name="downloads" />
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
