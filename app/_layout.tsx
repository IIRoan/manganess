import { GestureHandlerRootView } from 'react-native-gesture-handler';
import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider as NavigationThemeProvider,
} from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { ThemeProvider, useTheme } from '../constants/ThemeContext';
import { useRootNavigationState } from 'expo-router';
SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { theme } = useTheme();
  const colorScheme = useColorScheme();

  const activeTheme = theme === 'system' ? colorScheme : theme;

  return (
    <NavigationThemeProvider
      value={activeTheme === 'dark' ? DarkTheme : DefaultTheme}
    >
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </NavigationThemeProvider>
  );
}

export default function RootLayout() {
  const navigationState = useRootNavigationState();

  const [loaded] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });


  if (!navigationState?.key) {
    // Navigation state isn't ready yet
    return null;
  }

  useEffect(() => {
    
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider>
        <RootLayoutNav />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
