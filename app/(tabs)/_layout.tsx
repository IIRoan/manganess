import { Tabs, usePathname } from 'expo-router';
import React, { useState, useEffect } from 'react';
import { useColorScheme, View, StyleSheet, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { width } = Dimensions.get('window');
const TAB_BAR_WIDTH = width * 0.9;
const TAB_WIDTH = TAB_BAR_WIDTH / 5; 

export default function TabLayout() {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme = theme === 'system' ? systemColorScheme : theme as ColorScheme;
  const colors = Colors[colorScheme];
  const pathname = usePathname();
  const [enableDebugTab, setEnableDebugTab] = useState(false);

  useEffect(() => {
    loadEnableDebugTabSetting();
  }, []);

  const loadEnableDebugTabSetting = async () => {
    try {
      const value = await AsyncStorage.getItem('enableDebugTab');
      setEnableDebugTab(value === 'true');
    } catch (error) {
      console.error('Error loading enable debug tab setting:', error);
    }
  };

  const shouldShowTabBar = () => {
    const allowedPaths = ['/', '/mangasearch', '/settings', '/bookmarks'];
    if (enableDebugTab) {
      allowedPaths.push('/debug');
    }
    return allowedPaths.includes(pathname) || pathname.match(/^\/manga\/[^\/]+$/);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.card }}>
      <Tabs
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;

            if (route.name === 'index') {
              iconName = focused ? 'home' : 'home-outline';
            } else if (route.name === 'mangasearch') {
              iconName = focused ? 'search' : 'search-outline';
            } else if (route.name === 'bookmarks') {
              iconName = focused ? 'bookmark' : 'bookmark-outline';
            } else if (route.name === 'settings') {
              iconName = focused ? 'settings' : 'settings-outline';
            } else if (route.name === 'debug') {
              iconName = focused ? 'bug' : 'bug-outline';
            }

            return (
              <View style={styles.iconContainer}>
                <Ionicons name={iconName as any} size={size} color={color} />
                {focused && <View style={[styles.activeIndicator, { backgroundColor: colors.primary }]} />}
              </View>
            );
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.tabIconDefault,
          tabBarStyle: {
            position: 'absolute',
            bottom: 25,
            left: (width - TAB_BAR_WIDTH) / 2,
            right: (width - TAB_BAR_WIDTH) / 2,
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
        <Tabs.Screen name="bookmarks" options={{ title: 'Bookmarks' }} />
        <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
        
        <Tabs.Screen 
          name="debug" 
          options={{ 
            title: 'Debug',
            href: enableDebugTab ? undefined : null,
          }} 
        />
        
        {/* Hide all other routes */}
        <Tabs.Screen name="manga/[id]" options={{ href: null }} />
        <Tabs.Screen name="manga/[id]/chapter/[chapterNumber]" options={{ href: null }} />
      </Tabs>
    </View>
  );
}

const styles = StyleSheet.create({
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
