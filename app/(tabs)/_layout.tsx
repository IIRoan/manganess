import { Tabs, usePathname } from 'expo-router';
import React from 'react';
import { useColorScheme, View, StyleSheet, Platform } from 'react-native';
import { TabBarIcon } from '@/components/navigation/TabBarIcon';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';

export default function TabLayout() {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme = theme === 'system' ? systemColorScheme : theme as ColorScheme;
  const colors = Colors[colorScheme];
  const pathname = usePathname();

  const shouldShowTabBar = () => {
    const allowedPaths = ['/', '/mangasearch', '/settings', '/bookmarks']; // Fixed typo here
    return allowedPaths.includes(pathname) || pathname.match(/^\/manga\/[^\/]+$/);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <Tabs
        backBehavior="history"
        screenOptions={{
          tabBarActiveTintColor: colors.tint,
          tabBarInactiveTintColor: colors.tabIconDefault,
          tabBarStyle: {
            backgroundColor: colors.card,
            borderTopColor: colors.border,
            height: 60,
            marginBottom: 25,
            paddingBottom: 5,
            paddingTop: 5,
            display: shouldShowTabBar() ? 'flex' : 'none',
          },
          tabBarItemStyle: {
            paddingTop: 5,
          },
          tabBarLabelStyle: {
            fontWeight: '500',
            fontSize: 11,
          },
          headerStyle: {
            backgroundColor: colors.card,
          },
          headerTintColor: colors.text,
          headerShown: false,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name={focused ? 'home' : 'home-outline'} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="mangasearch"
          options={{
            title: 'Search',
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name={focused ? 'search' : 'search-outline'} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="bookmarks"
          options={{
            title: 'Bookmarks',
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name={focused ? 'bookmark' : 'bookmark-outline'} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color, focused }) => (
              <TabBarIcon name={focused ? 'settings' : 'settings-outline'} color={color} />
            ),
          }}
        />
        {/* Hide all other routes */}
        <Tabs.Screen
          name="manga/[id]"
          options={{
            href: null,
          }}
        />
        <Tabs.Screen
          name="manga/[id]/chapter/[chapterNumber]"
          options={{
            href: null,
          }}
        />
      </Tabs>
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 25,
          backgroundColor: colors.card,
        }}
      />
    </View>
  );
}
