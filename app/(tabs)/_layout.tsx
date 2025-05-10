import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  useColorScheme,
  TouchableOpacity,
  Animated,
  Alert,
} from 'react-native';
import { Tabs, usePathname, useRouter, useNavigation } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAppSettings, getDebugTabEnabled, isOnboardingCompleted as checkOnboarding } from '@/services/settingsService';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import OnboardingScreen from '../onboarding';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { imageCache } from '@/services/CacheImages';
import { getLastReadManga, LastReadManga } from '@/services/readChapterService';
import { useAppUpdates } from '@/hooks/useAppUpdates';

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
  const TAB_WIDTH = TAB_BAR_WIDTH / 5;

  const pathname = usePathname();
  const [enableDebugTab, setEnableDebugTab] = useState<boolean>(false);
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState<boolean | null>(null);
  const [lastReadManga, setLastReadManga] = useState<LastReadManga | null>(null);
  const buttonScale = useRef(new Animated.Value(1)).current;
  
  const [lastReadUpdateCount, setLastReadUpdateCount] = useState(0);
  const { updateStatus, updateAndReload } = useAppUpdates();

  useEffect(() => {
    loadEnableDebugTabSetting();
    checkOnboardingStatus();
    checkForUpdates();
    imageCache.initializeCache();
    
    const unsubscribe = navigation.addListener('focus', () => {
      refreshLastReadManga();
    });
    
    return unsubscribe;
  }, [navigation]);
  
  useEffect(() => {
    if (pathname === '/' || pathname === '/bookmarks' || pathname === '/settings' || pathname === '/mangasearch') {
      refreshLastReadManga();
    }
  }, [pathname]);


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
      setLastReadUpdateCount(prev => prev + 1);
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

  const checkForUpdates = useCallback(async () => {
    try {
      // This will check for updates, download them, and reload the app all in one call
      await updateAndReload();
      
      // No need for alerts since it happens in the background
      // If there is an error or no update, it will be handled silently
    } catch (error) {
      console.error('Error in update process:', error);
    }
  }, [updateAndReload]);

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
    const allowedPaths = ['/', '/mangasearch', '/settings', '/bookmarks'];
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
        <Tabs.Screen
          name="manga/[id].styles"
          options={{ href: null }}
        />
      </Tabs>
      
      {shouldShowTabBar() && (
        <Animated.View 
          style={[
            styles.lastButtonContainer,
            { 
              bottom: tabBarBottomPosition + 30,
              transform: [{ scale: buttonScale }]
            },
          ]}
        >
          <TouchableOpacity 
            style={[
              styles.lastButton, 
              { 
                backgroundColor: colors.primary,
                borderColor: colors.card,
              }
            ]}
            onPress={handleLastButtonPress}
            activeOpacity={0.8}
          >
            <Ionicons name="book" size={24} color="white" />
          </TouchableOpacity>
        </Animated.View>
      )}
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
  lastButtonContainer: {
    position: 'absolute', 
    alignSelf: 'center',
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
  }
});