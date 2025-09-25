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
import { AppState, AppStateStatus, StatusBar, useColorScheme } from 'react-native';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from '../constants/ThemeContext';
import ErrorBoundary from '../components/ErrorBoundary';
import { queryClient } from '@/utils/queryClient';

SplashScreen.preventAutoHideAsync();

function useReactQueryFocusManager() {
  useEffect(() => {
    const handleChange = (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    };

    const subscription = AppState.addEventListener('change', handleChange);
    return () => subscription.remove();
  }, []);
}

function AppProviders({ children }: { children: React.ReactNode }) {
  useReactQueryFocusManager();

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

function RootLayoutNav() {
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
      <AppProviders>
        <ThemeProvider>
          <RootLayoutNav />
        </ThemeProvider>
      </AppProviders>
    </GestureHandlerRootView>
  );
}
