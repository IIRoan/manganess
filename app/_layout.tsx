import { DarkTheme, DefaultTheme, ThemeProvider as NavigationThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';
import { useColorScheme } from 'react-native';
import { ThemeProvider, useTheme } from '../constants/ThemeContext';
import { setupNotifications } from '@/services/notificationSetup';
import * as MangaUpdateService from '@/services/mangaUpdateService';

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  useEffect(() => {
    setupNotifications();
  }, []);

  useEffect(() => {
    MangaUpdateService.startUpdateService();
    return () => {
      MangaUpdateService.stopUpdateService();
    };
  }, []);

  const { theme } = useTheme();
  const colorScheme = useColorScheme();

  const activeTheme = theme === 'system' ? colorScheme : theme;

  return (
    <NavigationThemeProvider value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </NavigationThemeProvider>
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
    <ThemeProvider>
      <RootLayoutNav />
    </ThemeProvider>
  );
}
