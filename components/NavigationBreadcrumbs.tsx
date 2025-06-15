import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import { BreadcrumbItem } from '@/types/navigation';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';

interface NavigationBreadcrumbsProps {
  breadcrumbs?: BreadcrumbItem[];
  maxItems?: number;
  showIcons?: boolean;
  compact?: boolean;
  style?: any;
}

const NavigationBreadcrumbs: React.FC<NavigationBreadcrumbsProps> = ({
  breadcrumbs: propBreadcrumbs,
  maxItems = 4,
  showIcons = true,
  compact = false,
  style,
}) => {
  const colorScheme = useColorScheme() as ColorScheme;
  const { breadcrumbs: contextBreadcrumbs, navigateToBreadcrumb } = useNavigationHistory();
  
  const breadcrumbs = propBreadcrumbs || contextBreadcrumbs;
  
  if (!breadcrumbs || breadcrumbs.length === 0) {
    return null;
  }

  const colors = Colors[colorScheme];
  
  // Limit breadcrumbs and add ellipsis if needed
  const displayBreadcrumbs = breadcrumbs.length > maxItems 
    ? [
        breadcrumbs[0], // Always show home
        { path: '...', title: '...', icon: 'ellipsis-horizontal', isClickable: false },
        ...breadcrumbs.slice(-2) // Show last 2 items
      ]
    : breadcrumbs;

  const handleBreadcrumbPress = async (item: BreadcrumbItem) => {
    if (item.isClickable && item.path !== '...') {
      await navigateToBreadcrumb(item.path);
    }
  };

  const getIconName = (icon?: string): keyof typeof Ionicons.glyphMap => {
    const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
      'home': 'home',
      'search': 'search',
      'book': 'book',
      'bookmark': 'bookmark',
      'settings': 'settings',
      'ellipsis-horizontal': 'ellipsis-horizontal',
    };
    return iconMap[icon || 'chevron-forward'] || 'chevron-forward';
  };

  return (
    <View style={[styles.container, style]}>
      <ScrollView 
        horizontal 
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        style={styles.scrollView}
      >
        {displayBreadcrumbs.map((item, index) => (
          <View key={`${item.path}-${index}`} style={styles.breadcrumbContainer}>
            <TouchableOpacity
              style={[
                styles.breadcrumb,
                compact && styles.breadcrumbCompact,
                !item.isClickable && styles.breadcrumbDisabled,
                {
                  backgroundColor: item.isClickable 
                    ? colors.background 
                    : 'transparent',
                },
              ]}
              onPress={() => handleBreadcrumbPress(item)}
              disabled={!item.isClickable}
              activeOpacity={0.7}
            >
              {showIcons && item.icon && (
                <Ionicons
                  name={getIconName(item.icon)}
                  size={compact ? 14 : 16}
                  color={item.isClickable ? colors.primary : colors.text}
                  style={styles.icon}
                />
              )}
              <Text
                style={[
                  styles.breadcrumbText,
                  compact && styles.breadcrumbTextCompact,
                  {
                    color: item.isClickable ? colors.primary : colors.text,
                  },
                ]}
                numberOfLines={1}
              >
                {item.title}
              </Text>
            </TouchableOpacity>
            
            {index < displayBreadcrumbs.length - 1 && (
              <Ionicons
                name="chevron-forward"
                size={compact ? 12 : 14}
                color={colors.textSecondary}
                style={styles.separator}
              />
            )}
          </View>
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
  scrollView: {
    flexGrow: 0,
  },
  scrollContent: {
    alignItems: 'center',
    paddingRight: 16,
  },
  breadcrumbContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  breadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    maxWidth: 120,
  },
  breadcrumbCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    maxWidth: 100,
  },
  breadcrumbDisabled: {
    opacity: 0.6,
  },
  icon: {
    marginRight: 4,
  },
  breadcrumbText: {
    fontSize: 14,
    fontWeight: '500',
  },
  breadcrumbTextCompact: {
    fontSize: 12,
    fontWeight: '400',
  },
  separator: {
    marginHorizontal: 4,
  },
});

export default NavigationBreadcrumbs;