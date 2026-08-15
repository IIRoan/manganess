import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  useColorScheme,
  Animated,
  StatusBar,
} from 'react-native';
import { Tabs, usePathname, useNavigation, useFocusEffect } from 'expo-router';
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
import { getLastReadManga } from '@/services/readChapterService';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { SwipeGestureOverlay } from '@/components/SwipeBackIndicator';
import { logger } from '@/utils/logger';

export default function TabLayout() {
  const navigation = useNavigation();
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
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState<
    boolean | null
  >(null);
  const buttonScale = useRef(new Animated.Value(1)).current;

  // Swipe gesture integration
  const {
    panResponder,
    isSwipingBack,
    swipeProgress,
    swipeOpacity,
    canSwipeBack,
  } = useSwipeBack();

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

  const refreshLastReadManga = useCallback(async () => {
    try {
      await getLastReadManga();
    } catch (error) {
      logger().error('Service', 'Error refreshing last read manga', { error });
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

    const unsubscribeFocus = navigation.addListener('focus', () => {
      refreshLastReadManga();
    });

    return () => {
      unsubscribeFocus();
    };
  }, [
    navigation,
    loadEnableDebugTabSetting,
    checkOnboardingStatus,
    refreshLastReadManga,
  ]);

  useEffect(() => {
    if (
      pathname === '/' ||
      pathname === '/bookmarks' ||
      pathname === '/settings' ||
      pathname === '/mangasearch'
    ) {
      refreshLastReadManga();
    }
  }, [pathname, refreshLastReadManga]);

  // Ensure status bar is always visible on non-chapter pages
  const isChapterPage = pathname.includes('/chapter/');

  useFocusEffect(
    useCallback(() => {
      if (!isChapterPage) {
        // Force status bar to be visible on all non-chapter pages
        StatusBar.setHidden(false);
        StatusBar.setTranslucent(true);
        StatusBar.setBackgroundColor('transparent');
      }
    }, [isChapterPage])
  );

  // Also ensure status bar visibility when pathname changes (covers navigation within tabs)
  useEffect(() => {
    if (!isChapterPage) {
      StatusBar.setHidden(false);
      StatusBar.setTranslucent(true);
      StatusBar.setBackgroundColor('transparent');
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
    return (
      allowedPaths.includes(pathname) || /^\/manga\/[^\/]+$/.test(pathname)
    );
  };

  if (isOnboardingCompleted === null) {
    return null;
  }

  if (!isOnboardingCompleted) {
    return <OnboardingScreen />;
  }

  const tabBarBottomPosition = insets.bottom + 15;

  return (
    <SwipeGestureOverlay
      enabled={canSwipeBack}
      panResponder={panResponder}
      swipeProgress={swipeProgress}
      swipeOpacity={swipeOpacity}
      isSwipingBack={isSwipingBack}
    >
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
          <Tabs.Screen name="manga/[id]" options={{ href: null }} />
          <Tabs.Screen
            name="manga/[id]/chapter/[chapterNumber]"
            options={{ href: null }}
          />
          <Tabs.Screen
            name="manga/[id]/chapter/[chapterNumber].styles"
            options={{ href: null }}
          />
          <Tabs.Screen name="manga/[id].styles" options={{ href: null }} />
        </Tabs>

        {false && shouldShowTabBar() && (
          <Animated.View
            style={[
              styles.lastButtonContainer,
              {
                bottom: tabBarBottomPosition + 30,
                right: (width - TAB_BAR_WIDTH) / 2 - 10,
                transform: [{ scale: buttonScale }],
              },
            ]}
          >
            {/*             <TouchableOpacity
              style={[
                styles.lastButton,
                {
                  backgroundColor: colors.primary,
                  borderColor: colors.card,
                },
              ]}
              onPress={handleLastButtonPress}
              activeOpacity={0.8}
            >
              <Ionicons name="book" size={24} color="white" />
            </TouchableOpacity> */}
          </Animated.View>
        )}
      </View>
    </SwipeGestureOverlay>
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
  lastButtonContainer: {
    position: 'absolute',
    alignItems: 'center',
    zIndex: 100,
  },
  lastButton: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    elevation: 0,
  },
  lastButtonLabel: {
    position: 'absolute',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    top: 48,
  },
  lastButtonText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
  },
});
