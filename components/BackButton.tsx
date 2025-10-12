/**
 * BackButton - Unified back button component with multiple variants
 *
 * This component replaces the old EnhancedBackButton and SmartBackButton components
 * and provides a consistent back button experience throughout the app.
 *
 * Variants:
 * - 'simple': Basic back button with minimal styling
 * - 'smart': Intelligent back button that shows contextual labels (e.g., "Home", "Search")
 * - 'enhanced': Advanced back button with long-press history and enhanced animations
 * - 'floating': Floating back button with shadow and positioning options
 *
 * Usage Examples:
 *
 * // Simple back button
 * <BackButton />
 *
 * // Smart back button with contextual labels
 * <BackButton variant="smart" showLabel={true} />
 *
 * // Enhanced back button with history panel
 * <BackButton variant="enhanced" showHistoryOnLongPress={true} />
 *
 * // Floating back button
 * <BackButton variant="floating" position="top-left" offset={{ x: 20, y: 60 }} />
 *
 * // Custom styled back button
 * <BackButton
 *   variant="smart"
 *   size={30}
 *   color="#FFFFFF"
 *   showLabel={true}
 *   showDepthIndicator={true}
 * />
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  Animated,
  useColorScheme,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';
import { useRouter, usePathname } from 'expo-router';
import { useHapticFeedback } from '@/utils/haptics';
import NavigationHistoryPanel from './NavigationHistoryPanel';

type BackButtonVariant = 'simple' | 'smart' | 'enhanced' | 'floating';
type BackButtonPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

interface BackButtonProps {
  // Appearance
  size?: number;
  color?: string;
  style?: any;
  variant?: BackButtonVariant;

  // Behavior
  showLabel?: boolean;
  showDepthIndicator?: boolean;
  showHistoryOnLongPress?: boolean;
  customOnPress?: () => void;
  disabled?: boolean;

  // Floating variant specific
  position?: BackButtonPosition;
  offset?: { x: number; y: number };

  // Accessibility
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

const BackButton: React.FC<BackButtonProps> = ({
  size = 24,
  color,
  style,
  variant = 'simple',
  showLabel = false,
  showDepthIndicator = true,
  showHistoryOnLongPress = false,
  customOnPress,
  disabled = false,
  position = 'top-left',
  offset = { x: 20, y: 60 },
  accessibilityLabel,
  accessibilityHint,
}) => {
  const colorScheme = useColorScheme() as ColorScheme;
  const { handleBackPress, canGoBack, navigationState, currentDepth } =
    useNavigationHistory();
  const router = useRouter();
  const pathname = usePathname();
  const haptics = useHapticFeedback();

  const [isPressed, setIsPressed] = useState(false);
  const [backLabel, setBackLabel] = useState('Back');
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const scaleAnim = new Animated.Value(1);

  const colors = Colors[colorScheme];
  const buttonColor = color || colors.text;
  const isDisabled = disabled || !canGoBack;

  // Smart label determination
  useEffect(() => {
    if (variant !== 'smart' && !showLabel) return;

    const determineBackLabel = () => {
      if (pathname.includes('/manga/') && pathname.includes('/chapter/')) {
        return 'Manga';
      } else if (pathname.includes('/manga/')) {
        const lastNonMangaRoute = navigationState.contextHistory
          .slice()
          .reverse()
          .find(
            (entry: any) =>
              !entry.path.includes('/manga/') ||
              (entry.path.includes('/manga/') &&
                entry.path.includes('/chapter/'))
          );

        if (lastNonMangaRoute) {
          if (lastNonMangaRoute.path === '/mangasearch') return 'Search';
          if (lastNonMangaRoute.path === '/') return 'Home';
          if (lastNonMangaRoute.path === '/bookmarks') return 'Library';
          if (lastNonMangaRoute.path === '/settings') return 'Settings';
        }
        return 'Search';
      } else if (pathname === '/settings') {
        return 'Home';
      } else if (pathname === '/bookmarks') {
        return 'Home';
      } else if (pathname === '/mangasearch') {
        return 'Home';
      }
      return 'Back';
    };

    setBackLabel(determineBackLabel());
  }, [pathname, navigationState, variant, showLabel]);

  const handlePress = async () => {
    if (isDisabled) return;

    haptics.onPress();

    // Animate button press for enhanced variants
    if (variant === 'smart' || variant === 'enhanced') {
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
      ]).start();
    }

    if (customOnPress) {
      customOnPress();
    } else {
      try {
        await handleBackPress('tap');
      } catch (error) {
        console.error('Back navigation failed:', error);
        router.replace('/');
      }
    }
  };

  const handleLongPress = () => {
    if (isDisabled || !showHistoryOnLongPress) return;
    haptics.onLongPress();
    setShowHistoryPanel(true);
  };

  const getBackgroundColor = () => {
    if (isDisabled) return 'transparent';
    if (isPressed) return colors.primary + '20';
    return variant === 'floating' ? colors.card : 'transparent';
  };

  const getContainerStyle = () => {
    const baseStyle = [
      styles.container,
      {
        backgroundColor: getBackgroundColor(),
        opacity: isDisabled ? 0.3 : 1,
      },
      style,
    ];

    if (variant === 'floating') {
      const floatingStyle = getFloatingPositionStyle();
      return [baseStyle, floatingStyle];
    }

    return baseStyle;
  };

  const getFloatingPositionStyle = () => {
    const baseFloatingStyle = {
      position: 'absolute' as const,
      width: 48,
      height: 48,
      borderRadius: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
      justifyContent: 'center' as const,
      alignItems: 'center' as const,
    };

    switch (position) {
      case 'top-left':
        return { ...baseFloatingStyle, top: offset.y, left: offset.x };
      case 'top-right':
        return { ...baseFloatingStyle, top: offset.y, right: offset.x };
      case 'bottom-left':
        return { ...baseFloatingStyle, bottom: offset.y, left: offset.x };
      case 'bottom-right':
        return { ...baseFloatingStyle, bottom: offset.y, right: offset.x };
      default:
        return { ...baseFloatingStyle, top: offset.y, left: offset.x };
    }
  };

  const renderDepthIndicator = () => {
    if (!showDepthIndicator || currentDepth <= 1) return null;

    if (variant === 'enhanced') {
      return (
        <View
          style={[styles.depthIndicator, { backgroundColor: colors.primary }]}
        >
          <Ionicons
            name="ellipsis-horizontal"
            size={size * 0.5}
            color={colors.background}
          />
        </View>
      );
    }

    // Smart and other variants show numeric depth
    return (
      <View
        style={[styles.depthIndicator, { backgroundColor: colors.primary }]}
      >
        <Text style={[styles.depthText, { color: colors.background }]}>
          {Math.min(currentDepth - 1, 9)}
        </Text>
      </View>
    );
  };

  const renderContent = () => {
    const content = (
      <View style={styles.iconContainer}>
        <Ionicons name="arrow-back" size={size} color={buttonColor} />
        {renderDepthIndicator()}
      </View>
    );

    if (showLabel && (variant === 'smart' || variant === 'enhanced')) {
      return (
        <View style={styles.content}>
          {content}
          <Text style={[styles.label, { color: buttonColor }]}>
            {backLabel}
          </Text>
        </View>
      );
    }

    return content;
  };

  const ButtonComponent = variant === 'enhanced' ? Pressable : TouchableOpacity;
  const buttonProps =
    variant === 'enhanced'
      ? {
          onPress: handlePress,
          onLongPress: showHistoryOnLongPress ? handleLongPress : undefined,
          onPressIn: () => setIsPressed(true),
          onPressOut: () => setIsPressed(false),
          disabled: isDisabled,
          delayLongPress: 500,
        }
      : {
          onPress: handlePress,
          onLongPress: showHistoryOnLongPress ? handleLongPress : undefined,
          onPressIn: () => setIsPressed(true),
          onPressOut: () => setIsPressed(false),
          disabled: isDisabled,
          activeOpacity: 0.7,
        };

  const finalAccessibilityLabel =
    accessibilityLabel || `Go back to ${backLabel}`;
  const finalAccessibilityHint =
    accessibilityHint ||
    `Navigate back to the previous ${backLabel.toLowerCase()} page`;

  return (
    <>
      <ButtonComponent
        style={getContainerStyle()}
        accessibilityRole="button"
        accessibilityLabel={finalAccessibilityLabel}
        accessibilityHint={finalAccessibilityHint}
        {...buttonProps}
      >
        {variant === 'smart' || variant === 'enhanced' ? (
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            {renderContent()}
          </Animated.View>
        ) : (
          renderContent()
        )}
      </ButtonComponent>

      {showHistoryOnLongPress && (
        <NavigationHistoryPanel
          visible={showHistoryPanel}
          onClose={() => setShowHistoryPanel(false)}
        />
      )}
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 40,
    minHeight: 40,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  depthIndicator: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
  },
  depthText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  label: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '500',
  },
});

export default BackButton;
