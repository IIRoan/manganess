import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  useColorScheme,
} from 'react-native';
import { Tabs, usePathname } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getAppSettings, getDebugTabEnabled, isOnboardingCompleted as checkOnboarding } from '@/services/settingsService';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import OnboardingScreen from '../onboarding';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import { imageCache } from '@/services/CacheImages';

export default function TabLayout() {
  // Theme and color scheme
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];

  // Safe area insets
  const insets = useSafeAreaInsets();

  // Screen dimensions
  const { width } = Dimensions.get('window');
  const TAB_BAR_WIDTH = width * 0.9;
  const TAB_WIDTH = TAB_BAR_WIDTH / 5;

  // State variables
  const [updateMessage, setUpdateMessage] = useState<string>('');
  const [showUpdateAlert, setShowUpdateAlert] = useState(false);
  const pathname = usePathname();
  const [enableDebugTab, setEnableDebugTab] = useState<boolean>(false);
  const [isOnboardingCompleted, setIsOnboardingCompleted] = useState<boolean | null>(null);

  useEffect(() => {
    loadEnableDebugTabSetting();
    checkOnboardingStatus();
    checkForUpdates();
    imageCache.initializeCache();
  }, []);

  const loadEnableDebugTabSetting = async () => {
    try {
      const enabled = await getDebugTabEnabled();
      setEnableDebugTab(enabled);
    } catch (error) {
      console.error('Error loading enable debug tab setting:', error);
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

  const checkForUpdates = async () => {
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        setUpdateMessage('The app will now restart to apply the update.');
        await Updates.fetchUpdateAsync();
        setShowUpdateAlert(true);
      }
    } catch (error) {
      console.log('Error checking for updates:', error);
    }
  };

  const handleUpdate = async () => {
    await Updates.reloadAsync();
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
    // Render the onboarding screen if the user hasn't completed the onboarding process
    return <OnboardingScreen />;
  }

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
            bottom: insets.bottom + 25,
            marginHorizontal: (width - TAB_BAR_WIDTH) / 2,
            backgroundColor: colors.card,
            borderRadius: 25,
            height: 60,
            width: TAB_BAR_WIDTH,
            paddingBottom: 5,
            paddingTop: 5,
            display: shouldShowTabBar() ? 'flex' : 'none',
            ...styles.tabBarShadow,
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
        {/* Hide all other routes */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  tabBarShadow: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 2,
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
