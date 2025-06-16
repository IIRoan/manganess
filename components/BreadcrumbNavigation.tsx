import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/constants/ThemeContext';
import { Colors } from '@/constants/Colors';
import { useRouter, usePathname } from 'expo-router';
import { useHapticFeedback } from '@/utils/haptics';

interface BreadcrumbItem {
  path: string;
  title: string;
  icon?: keyof typeof Ionicons.glyphMap;
  isClickable?: boolean;
}

interface BreadcrumbNavigationProps {
  customBreadcrumbs?: BreadcrumbItem[];
  showIcons?: boolean;
  maxItems?: number;
  style?: any;
}

const BreadcrumbNavigation: React.FC<BreadcrumbNavigationProps> = ({
  customBreadcrumbs,
  showIcons = true,
  maxItems = 4,
  style,
}) => {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const router = useRouter();
  const pathname = usePathname();
  const haptics = useHapticFeedback();

  const generateBreadcrumbs = (): BreadcrumbItem[] => {
    if (customBreadcrumbs) return customBreadcrumbs;

    const breadcrumbs: BreadcrumbItem[] = [];

    // Add home breadcrumb
    breadcrumbs.push({
      path: '/',
      title: 'Home',
      icon: 'home',
      isClickable: true,
    });

    // Add context-specific breadcrumbs based on current path
    if (pathname.includes('/manga/')) {
      // Add search/discovery breadcrumb
      breadcrumbs.push({
        path: '/mangasearch',
        title: 'Search',
        icon: 'search',
        isClickable: true,
      });

      if (pathname.includes('/chapter/')) {
        // Extract manga ID for manga detail link
        const mangaMatch = pathname.match(/\/manga\/([^\/]+)/);
        if (mangaMatch) {
          breadcrumbs.push({
            path: `/manga/${mangaMatch[1]}`,
            title: 'Manga',
            icon: 'book',
            isClickable: true,
          });
        }

        // Add current chapter (not clickable)
        const chapterMatch = pathname.match(/\/chapter\/([^\/]+)/);
        if (chapterMatch) {
          breadcrumbs.push({
            path: pathname,
            title: `Chapter ${chapterMatch[1]}`,
            icon: 'bookmark',
            isClickable: false,
          });
        }
      } else {
        // On manga detail page (not clickable)
        breadcrumbs.push({
          path: pathname,
          title: 'Manga Details',
          icon: 'book',
          isClickable: false,
        });
      }
    } else if (pathname === '/bookmarks') {
      breadcrumbs.push({
        path: pathname,
        title: 'Library',
        icon: 'library',
        isClickable: false,
      });
    } else if (pathname === '/mangasearch') {
      breadcrumbs.push({
        path: pathname,
        title: 'Search',
        icon: 'search',
        isClickable: false,
      });
    } else if (pathname === '/settings') {
      breadcrumbs.push({
        path: pathname,
        title: 'Settings',
        icon: 'settings',
        isClickable: false,
      });
    }

    return breadcrumbs;
  };

  const breadcrumbs = generateBreadcrumbs();
  const displayBreadcrumbs = breadcrumbs.slice(-maxItems);

  const handleBreadcrumbPress = (item: BreadcrumbItem) => {
    if (!item.isClickable) return;
    
    haptics.onSelection();
    router.navigate(item.path as any);
  };

  if (breadcrumbs.length <= 1) return null;

  return (
    <View style={[styles.container, style]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {displayBreadcrumbs.map((item, index) => (
          <React.Fragment key={item.path}>
            {index > 0 && (
              <Ionicons
                name="chevron-forward"
                size={16}
                color={colors.tabIconDefault}
                style={styles.separator}
              />
            )}
            
            <TouchableOpacity
              onPress={() => handleBreadcrumbPress(item)}
              disabled={!item.isClickable}
              style={[
                styles.breadcrumbItem,
                !item.isClickable && styles.disabledItem,
              ]}
              accessibilityRole="button"
              accessibilityLabel={`Navigate to ${item.title}`}
              accessibilityHint={item.isClickable ? `Go to ${item.title} page` : 'Current page'}
            >
              <View style={styles.breadcrumbContent}>
                {showIcons && item.icon && (
                  <Ionicons
                    name={item.icon}
                    size={14}
                    color={
                      item.isClickable
                        ? colors.primary
                        : colors.tabIconDefault
                    }
                    style={styles.icon}
                  />
                )}
                
                <Text
                  style={[
                    styles.breadcrumbText,
                    {
                      color: item.isClickable
                        ? colors.primary
                        : colors.text,
                    },
                    !item.isClickable && styles.currentText,
                  ]}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
              </View>
            </TouchableOpacity>
          </React.Fragment>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  scrollContent: {
    alignItems: 'center',
    paddingRight: 16,
  },
  breadcrumbItem: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    maxWidth: 120,
  },
  disabledItem: {
    opacity: 1,
  },
  breadcrumbContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 4,
  },
  breadcrumbText: {
    fontSize: 14,
    fontWeight: '500',
  },
  currentText: {
    fontWeight: '600',
  },
  separator: {
    marginHorizontal: 4,
  },
});

export default BreadcrumbNavigation;