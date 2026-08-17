import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  useColorScheme,
  StatusBar,
  Platform,
} from 'react-native';
import { Tabs, usePathname, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getDebugTabEnabled,
  isOnboardingCompleted as checkOnboarding,
} from '@/services/settingsService';
import { useTheme } from '@/hooks/useTheme';
import { Colors, ColorScheme } from '@/constants/Colors';
import OnboardingScreen from '../onboarding';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { imageCache } from '@/services/CacheImages';
import { logger } from '@/utils/logger';
import { isRootStackRoute } from '@/constants/navigation';

export default function TabLayout() {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];

  const insets = useSafeAreaInsets();

  const { width } = Dimensions.get('window');
  const [enableDebugTab, setEnableDebugTab] = useState<boolean>(false);
  const TAB_BAR_WIDTH = width * 0.9;
  const visibleTabCount = enableDebugTab ? 5 : 4;
  const TAB_WIDTH = TAB_BAR_WIDTH / visibleTabCount;

  const pathname = usePathname();
  const lastTabPathRef = useRef(pathname);
  if (!isRootStackRoute(pathname)) {
    lastTabPathRef.current = pathname;
  }
  const tabPathname = isRootStackRoute(pathname)
    ? lastTabPathRef.current
    : pathname;
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState<
    boolean | null
  >(null);

  const loadEnableDebugTabSetting = useCallback(async () => {
    try {
      const enabled = await getDebugTabEnabled();
      setEnableDebugTab(enabled);
    } catch (error) {
      logger().error('Service', 'Error loading enable debug tab setting', {
        error,
      });
    }
  }, []);

  const checkOnboardingStatus = useCallback(async () => {
    try {
      const completed = await checkOnboarding();
      setIsOnboardingCompleted(completed);
    } catch (error) {
      logger().error('Service', 'Error checking onboarding status', { error });
      setIsOnboardingCompleted(false);
    }
  }, []);

  useEffect(() => {
    loadEnableDebugTabSetting();
    checkOnboardingStatus();

    imageCache.initializeCache();
  }, [loadEnableDebugTabSetting, checkOnboardingStatus]);

  // Ensure status bar is always visible on non-chapter pages
  const isChapterPage = pathname.includes('/chapter/');

  useFocusEffect(
    useCallback(() => {
      if (!isChapterPage) {
        StatusBar.setHidden(false);
        if (Platform.OS === 'android') {
          StatusBar.setTranslucent(true);
          StatusBar.setBackgroundColor('transparent');
        }
      }
    }, [isChapterPage])
  );

  useEffect(() => {
    if (!isChapterPage) {
      StatusBar.setHidden(false);
      if (Platform.OS === 'android') {
        StatusBar.setTranslucent(true);
        StatusBar.setBackgroundColor('transparent');
      }
    }
  }, [isChapterPage]);

  const shouldShowTabBar = () => {
    const allowedPaths = [
      '/',
      '/mangasearch',
      '/settings',
      '/bookmarks',
      '/genres',
    ];
    if (enableDebugTab) {
      allowedPaths.push('/Debug');
    }
    return allowedPaths.includes(tabPathname);
  };

  if (isOnboardingCompleted === null) {
    return null;
  }

  if (!isOnboardingCompleted) {
    return <OnboardingScreen />;
  }

  const tabBarBottomPosition = insets.bottom + 15;

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      <Tabs
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName: keyof typeof Ionicons.glyphMap;

            switch (route.name) {
              case 'index':
                iconName = focused ? 'home' : 'home-outline';
                break;
              case 'mangasearch':
                iconName = focused ? 'search' : 'search-outline';
                break;
              case 'bookmarks':
                iconName = focused ? 'bookmark' : 'bookmark-outline';
                break;
              case 'settings':
                iconName = focused ? 'settings' : 'settings-outline';
                break;
              case 'Debug':
                iconName = focused ? 'bug' : 'bug-outline';
                break;
              default:
                iconName = 'help-outline';
            }

            return (
              <View style={styles.iconContainer}>
                <Ionicons name={iconName} size={size} color={color} />
                {focused && (
                  <View
                    style={[
                      styles.activeIndicator,
                      { backgroundColor: colors.primary },
                    ]}
                  />
                )}
              </View>
            );
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.tabIconDefault,
          tabBarStyle: {
            position: 'absolute',
            bottom: tabBarBottomPosition,
            marginHorizontal: (width - TAB_BAR_WIDTH) / 2,
            backgroundColor: colors.card,
            borderRadius: 35,
            height: 60,
            width: TAB_BAR_WIDTH,
            paddingBottom: 5,
            paddingTop: 5,
            display: shouldShowTabBar() ? 'flex' : 'none',
            elevation: 4,
          },
          tabBarItemStyle: {
            height: 50,
            width: TAB_WIDTH,
          },
          tabBarLabelStyle: {
            fontWeight: '600',
            fontSize: 10,
            marginTop: 5,
          },
          headerStyle: {
            backgroundColor: colors.card,
          },
          headerTintColor: colors.text,
          headerShown: false,
        })}
        backBehavior="history"
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="mangasearch" options={{ title: 'Search' }} />
        <Tabs.Screen name="bookmarks" options={{ title: 'Saved' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
        <Tabs.Screen
          name="Debug"
          options={
            {
              title: 'Debug',
              href: enableDebugTab ? undefined : null,
            } as any
          }
        />
        <Tabs.Screen name="genres" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  activeIndicator: {
    position: 'absolute',
    bottom: -5,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
});
