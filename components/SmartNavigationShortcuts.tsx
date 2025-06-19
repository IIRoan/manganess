import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useColorScheme,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';
import { NavigationEntry } from '@/types/navigation';

interface SmartNavigationShortcutsProps {
  visible: boolean;
  style?: any;
  maxShortcuts?: number;
  onNavigate?: (path: string) => void;
}

const SmartNavigationShortcuts: React.FC<SmartNavigationShortcutsProps> = ({
  visible,
  style,
  maxShortcuts = 6,
  onNavigate,
}) => {
  const colorScheme = useColorScheme() as ColorScheme;
  const { navigateTo, getAnalytics } = useNavigationHistory();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const colors = Colors[colorScheme];

  useEffect(() => {
    if (visible) {
      loadSmartSuggestions();
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, fadeAnim]);

  const loadSmartSuggestions = async () => {
    try {
      const analytics = await getAnalytics();
      if (analytics) {
        // Get most visited paths as suggestions
        const topPaths = Object.entries(analytics.mostVisitedPaths)
          .sort(([, a], [, b]) => b - a)
          .slice(0, maxShortcuts)
          .map(([path]) => path);

        setSmartSuggestions(topPaths);
      }
    } catch (error) {
      console.error('Error loading smart suggestions:', error);
    }
  };

  const getShortcutData = () => {
    const shortcuts: {
      path: string;
      title: string;
      icon: keyof typeof Ionicons.glyphMap;
      color: string;
      description: string;
    }[] = [];

    // Add predefined quick shortcuts
    const quickShortcuts = [
      {
        path: '/',
        title: 'Home',
        icon: 'home' as keyof typeof Ionicons.glyphMap,
        color: colors.primary,
        description: 'Go to home screen',
      },
      {
        path: '/mangasearch',
        title: 'Search',
        icon: 'search' as keyof typeof Ionicons.glyphMap,
        color: '#FF6B6B',
        description: 'Search for manga',
      },
      {
        path: '/bookmarks',
        title: 'Bookmarks',
        icon: 'bookmark' as keyof typeof Ionicons.glyphMap,
        color: '#4ECDC4',
        description: 'Your saved manga',
      },
      {
        path: '/settings',
        title: 'Settings',
        icon: 'settings' as keyof typeof Ionicons.glyphMap,
        color: '#95A5A6',
        description: 'App settings',
      },
    ];

    shortcuts.push(...quickShortcuts);

    // Add smart suggestions from analytics
    smartSuggestions.forEach((path) => {
      if (shortcuts.find((s) => s.path === path)) return; // Skip duplicates

      let title = 'Page';
      let icon: keyof typeof Ionicons.glyphMap = 'document';
      let color = colors.textSecondary;
      let description = path;

      // Parse path to get meaningful data
      if (path.includes('/manga/') && path.includes('/chapter/')) {
        const chapterMatch = path.match(/\/chapter\/([^\/]+)/);
        title = chapterMatch ? `Chapter ${chapterMatch[1]}` : 'Chapter';
        icon = 'book-outline';
        color = '#9B59B6';
        description = 'Continue reading';
      } else if (path.includes('/manga/')) {
        title = 'Manga Details';
        icon = 'library';
        color = '#E67E22';
        description = 'View manga details';
      }

      shortcuts.push({ path, title, icon, color, description });
    });

    return shortcuts.slice(0, maxShortcuts);
  };

  const handleShortcutPress = async (path: string) => {
    try {
      if (onNavigate) {
        onNavigate(path);
      } else {
        await navigateTo(path, { replace: true });
      }
    } catch (error) {
      console.error('Error navigating to shortcut:', error);
    }
  };

  if (!visible) {
    return null;
  }

  const shortcuts = getShortcutData();

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim }, style]}>
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Ionicons name="flash" size={20} color={colors.primary} />
        <Text style={[styles.title, { color: colors.text }]}>
          Quick Navigation
        </Text>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {shortcuts.map((shortcut, index) => (
          <TouchableOpacity
            key={`${shortcut.path}-${index}`}
            style={[
              styles.shortcut,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
            onPress={() => handleShortcutPress(shortcut.path)}
            activeOpacity={0.7}
          >
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: shortcut.color + '20' },
              ]}
            >
              <Ionicons name={shortcut.icon} size={24} color={shortcut.color} />
            </View>
            <Text
              style={[styles.shortcutTitle, { color: colors.text }]}
              numberOfLines={1}
            >
              {shortcut.title}
            </Text>
            <Text
              style={[
                styles.shortcutDescription,
                { color: colors.textSecondary },
              ]}
              numberOfLines={1}
            >
              {shortcut.description}
            </Text>
          </TouchableOpacity>
        ))}

        {shortcuts.length === 0 && (
          <View style={styles.emptyState}>
            <Ionicons
              name="rocket-outline"
              size={32}
              color={colors.textSecondary}
            />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              Start navigating to see smart shortcuts
            </Text>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
};

interface FloatingShortcutsProps extends SmartNavigationShortcutsProps {
  position?: 'top' | 'bottom';
  offset?: number;
}

export const FloatingSmartShortcuts: React.FC<FloatingShortcutsProps> = ({
  position = 'bottom',
  offset = 120,
  ...props
}) => {
  const positionStyle =
    position === 'top' ? { top: offset } : { bottom: offset };

  return (
    <SmartNavigationShortcuts
      {...props}
      style={[
        {
          position: 'absolute',
          left: 16,
          right: 16,
          zIndex: 1000,
        },
        positionStyle,
        props.style,
      ]}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  scrollView: {
    maxHeight: 120,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  shortcut: {
    width: 100,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    marginRight: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  shortcutTitle: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 2,
    textAlign: 'center',
  },
  shortcutDescription: {
    fontSize: 10,
    textAlign: 'center',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 8,
  },
});

export default SmartNavigationShortcuts;
