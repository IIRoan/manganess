import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  useColorScheme,
  TouchableOpacity,
  Animated,
  AppState,
} from 'react-native';
import { Tabs, usePathname, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getDebugTabEnabled,
  isOnboardingCompleted as checkOnboarding,
} from '@/services/settingsService';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import OnboardingScreen from '../onboarding';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { imageCache } from '@/services/CacheImages';
import { getLastReadManga, LastReadManga } from '@/services/readChapterService';
import { useAppUpdates } from '@/hooks/useAppUpdates';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { SwipeGestureOverlay } from '@/components/SwipeBackIndicator';

export default function TabLayout() {
  const router = useRouter();
  const navigation = useNavigation();
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];

  const insets = useSafeAreaInsets();

  const { width } = Dimensions.get('window');
  const TAB_BAR_WIDTH = width * 0.9;
  const visibleTabCount = enableDebugTab ? 6 : 5;
  const TAB_WIDTH = TAB_BAR_WIDTH / visibleTabCount;

  const appState = useRef(AppState.currentState);
  const pathname = usePathname();
  const [enableDebugTab, setEnableDebugTab] = useState<boolean>(false);
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState<
    boolean | null
  >(null);
  const [lastReadManga, setLastReadManga] = useState<LastReadManga | null>(
    null
  );
  const buttonScale = useRef(new Animated.Value(1)).current;

  // Get update status from the hook
  const { updateStatus, updateAndReload, checkForUpdate, isUpdateInProgress } =
    useAppUpdates();

  // Swipe gesture integration
  const {
    panResponder,
    isSwipingBack,
    swipeProgress,
    swipeOpacity,
    canSwipeBack,
  } = useSwipeBack();

  // Animation values
  const updateIndicatorOpacity = useRef(new Animated.Value(0)).current;
  const updateIndicatorRotation = useRef(new Animated.Value(0)).current;
  const updateProgressWidth = useRef(new Animated.Value(0)).current;
  // Track whether progress has started
  const [progressStarted, setProgressStarted] = useState(false);

  // Animation ref
  const updateAnimationRef = useRef<Animated.CompositeAnimation | null>(null);
  const progressAnimationRef = useRef<Animated.CompositeAnimation | null>(null);

  // Determine if we should actually show the indicator
  // Only show for downloading updates or when ready to apply, not for checks
  const shouldShowUpdateIndicator =
    isUpdateInProgress && (updateStatus.isDownloading || updateStatus.isReady);

  useEffect(() => {
    loadEnableDebugTabSetting();
    checkOnboardingStatus();

    performUpdateCheck();

    imageCache.initializeCache();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (
        appState.current.match(/inactive|background/) &&
        nextAppState === 'active'
      ) {
        console.log('App has come to the foreground, checking for updates...');
        performUpdateCheck();
      }

      appState.current = nextAppState;
    });

    const unsubscribeFocus = navigation.addListener('focus', () => {
      refreshLastReadManga();
    });

    return () => {
      subscription.remove();
      unsubscribeFocus();
      if (updateAnimationRef.current) {
        updateAnimationRef.current.stop();
      }
      if (progressAnimationRef.current) {
        progressAnimationRef.current.stop();
      }
    };
  }, [navigation]);

  useEffect(() => {
    if (
      pathname === '/' ||
      pathname === '/bookmarks' ||
      pathname === '/settings' ||
      pathname === '/mangasearch'
    ) {
      refreshLastReadManga();
    }
  }, [pathname]);

  // Update animation based on whether we should show the indicator
  useEffect(() => {
    // Stop any existing animations
    if (updateAnimationRef.current) {
      updateAnimationRef.current.stop();
      updateAnimationRef.current = null;
    }

    if (progressAnimationRef.current) {
      progressAnimationRef.current.stop();
      progressAnimationRef.current = null;
    }

    if (shouldShowUpdateIndicator) {
      // Show the indicator immediately
      Animated.timing(updateIndicatorOpacity, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Start a continuous rotation for the spinner
      const rotateAnimation = Animated.timing(updateIndicatorRotation, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      });

      // Create a looping rotation
      const loopingRotation = Animated.loop(rotateAnimation);

      // Start the rotation animation
      loopingRotation.start();

      // Keep track of the animation
      updateAnimationRef.current = loopingRotation;

      // Create simulated progress for short updates
      // Progress moves quickly to 70% then slows down
      progressAnimationRef.current = Animated.sequence([
        Animated.timing(updateProgressWidth, {
          toValue: 0.7, // Go to 70% quickly
          duration: 500, // Even faster for shorter updates
          useNativeDriver: false,
        }),
        Animated.timing(updateProgressWidth, {
          toValue: 0.9, // Then more slowly to 90%
          duration: 1200,
          useNativeDriver: false,
        }),
      ]);

      progressAnimationRef.current.start();
      setProgressStarted(true);
    } else {
      // When update completes, instantly fill the progress bar to 100%
      // then fade out the entire indicator
      if (progressStarted) {
        Animated.sequence([
          // First fill the progress bar to 100%
          Animated.timing(updateProgressWidth, {
            toValue: 1,
            duration: 200,
            useNativeDriver: false,
          }),
          // Then after a short delay, fade out the whole indicator
          Animated.delay(500),
          Animated.timing(updateIndicatorOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => {
          // Reset the progress after the animation completes
          updateProgressWidth.setValue(0);
          updateIndicatorRotation.setValue(0);
          setProgressStarted(false);
        });
      } else {
        // If we haven't shown any progress yet, just hide it immediately
        Animated.timing(updateIndicatorOpacity, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }).start();

        // Reset animation values
        updateProgressWidth.setValue(0);
        updateIndicatorRotation.setValue(0);
      }
    }
  }, [shouldShowUpdateIndicator, progressStarted]);

  useEffect(() => {
    // Special case for when update is ready - fill the progress bar
    if (updateStatus.isReady && progressAnimationRef.current) {
      progressAnimationRef.current.stop();
      Animated.timing(updateProgressWidth, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [updateStatus.isReady]);

  const loadEnableDebugTabSetting = async () => {
    try {
      const enabled = await getDebugTabEnabled();
      setEnableDebugTab(enabled);
    } catch (error) {
      console.error('Error loading enable debug tab setting:', error);
    }
  };

  const refreshLastReadManga = async () => {
    try {
      const lastRead = await getLastReadManga();
      setLastReadManga(lastRead);
    } catch (error) {
      console.error('Error refreshing last read manga:', error);
    }
  };

  const checkOnboardingStatus = async () => {
    try {
      const completed = await checkOnboarding();
      setIsOnboardingCompleted(completed);
    } catch (error) {
      console.error('Error checking onboarding status:', error);
      setIsOnboardingCompleted(false);
    }
  };

  const performUpdateCheck = useCallback(async () => {
    console.log('Performing update check...');
    try {
      // First check if update is available
      const checkResult = await checkForUpdate();
      console.log('Update check result:', checkResult);

      if (checkResult.success) {
        console.log('Update available, downloading and applying...');
        // If an update is available, download and apply it
        await updateAndReload();
      } else {
        console.log(
          'No update available or unable to check:',
          checkResult.message
        );
      }
    } catch (error) {
      console.error('Error in update process:', error);
    }
  }, [checkForUpdate, updateAndReload]);

  const handleLastButtonPress = () => {
    Animated.sequence([
      Animated.timing(buttonScale, {
        toValue: 0.9,
        duration: 100,
        useNativeDriver: true,
      }),
      Animated.timing(buttonScale, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();

    if (lastReadManga && lastReadManga.id) {
      console.log('Navigating to manga:', lastReadManga);
      router.push(`/manga/${lastReadManga.id}`);
    } else {
      console.log('No last read manga found, navigating to search');
      router.push('/mangasearch');
    }
  };

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

  const getUpdateStatusMessage = () => {
    if (updateStatus.isDownloading) return 'Downloading update...';
    if (updateStatus.isReady) return 'Update ready!';
    return '';
  };

  // Create interpolated rotation value for the spinner icon
  const spin = updateIndicatorRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Get the width for the progress bar
  const progressBarWidth = updateProgressWidth.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

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
        {/* Update Indicator - Only shown during downloading or ready states */}
        <Animated.View
          style={[
            styles.updateIndicatorContainer,
            {
              backgroundColor: colorScheme === 'dark' ? '#1E1E1E' : '#FFFFFF',
              opacity: updateIndicatorOpacity,
              top: insets.top + 8,
              borderColor: colors.primary,
            },
          ]}
          pointerEvents="none"
        >
          <Animated.View style={{ transform: [{ rotate: spin }] }}>
            <Ionicons
              name="sync"
              size={18}
              color={colors.primary}
              style={styles.updateIndicatorIcon}
            />
          </Animated.View>

          <View style={styles.updateContentContainer}>
            <Text
              style={[
                styles.updateIndicatorText,
                { color: colorScheme === 'dark' ? '#FFFFFF' : '#333333' },
              ]}
            >
              {getUpdateStatusMessage()}
            </Text>

            {/* Progress bar */}
            <View
              style={[
                styles.progressBarContainer,
                {
                  backgroundColor:
                    colorScheme === 'dark' ? '#333333' : '#EEEEEE',
                },
              ]}
            >
              <Animated.View
                style={[
                  styles.progressBar,
                  {
                    backgroundColor: colors.primary,
                    width: progressBarWidth,
                  },
                ]}
              />
            </View>
          </View>
        </Animated.View>

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
                case 'genres':
                  iconName = focused ? 'albums' : 'albums-outline';
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
          <Tabs.Screen name="genres" options={{ title: 'Genres' }} />
          <Tabs.Screen name="bookmarks" options={{ title: 'Saved' }} />
          <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
          <Tabs.Screen
            name="Debug"
            options={{
              title: 'Debug',
              href: enableDebugTab ? undefined : null,
            }}
          />
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
  // Update indicator styles
  updateIndicatorContainer: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 1000,
    alignSelf: 'center',
    maxWidth: '90%',
    borderWidth: 1,
  },
  updateContentContainer: {
    flex: 1,
    marginLeft: 10,
  },
  updateIndicatorText: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  updateIndicatorIcon: {
    marginRight: 2,
  },
  progressBarContainer: {
    height: 4,
    borderRadius: 2,
    width: '100%',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    borderRadius: 2,
  },
});
