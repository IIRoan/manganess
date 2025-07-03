// @ts-nocheck
import React, { useEffect } from 'react';
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
// import { NavigationEntry } from '@/types/navigation';

interface SmartNavigationShortcutsProps {
  visible: boolean;
  style?: any;
  maxShortcuts?: number;
  onNavigate?: (path: string) => void;
}

const SmartNavigationShortcuts: React.FC<SmartNavigationShortcutsProps> = ({
  visible,
  style,
  maxShortcuts = 5,
  onNavigate,
}) => {
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colors = Colors[systemColorScheme];
  const { navigationState } = useNavigationHistory();

  const loadSmartSuggestions = async () => {
    try {
      // Mock implementation for now
      // const suggestions = await navigationHistory.getSmartSuggestions();
      const suggestions: string[] = [];
      console.log('Smart suggestions loaded:', suggestions);
    } catch (error) {
      console.error('Error loading smart suggestions:', error);
    }
  };

  useEffect(() => {
    if (visible) {
      loadSmartSuggestions();
    }
  }, [visible, navigationState]);

  const handleShortcutPress = (path: string) => {
    if (onNavigate) {
      onNavigate(path);
    }
  };

  const getIconForPath = (path: string): keyof typeof Ionicons.glyphMap => {
    if (path.includes('/manga/')) return 'book';
    if (path.includes('/search')) return 'search';
    if (path.includes('/bookmarks')) return 'bookmark';
    if (path.includes('/settings')) return 'settings';
    return 'navigate';
  };

  if (!visible) return null;

  return (
    <Animated.View style={[styles.container, style]}>
      <Text style={[styles.title, { color: colors.text }]}>Quick Access</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContainer}
      >
        {[].map((path: string) => (
          <TouchableOpacity
            key={path}
            style={[styles.shortcut, { backgroundColor: colors.card }]}
            onPress={() => handleShortcutPress(path)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={getIconForPath(path)}
              size={20}
              color={colors.primary}
              style={styles.shortcutIcon}
            />
            <Text
              style={[
                styles.shortcutText,
                {
                  color: colors.tabIconDefault,
                },
              ]}
              numberOfLines={1}
            >
              {path.split('/').pop() || 'Unknown'}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  scrollContainer: {
    paddingHorizontal: 4,
  },
  shortcut: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 4,
    borderRadius: 20,
    minWidth: 100,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  shortcutIcon: {
    marginRight: 6,
  },
  shortcutText: {
    fontSize: 12,
    fontWeight: '500',
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
    marginTop: 8,
  },
});

export default SmartNavigationShortcuts;