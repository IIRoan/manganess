import React, { useState, useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Text,
  Animated,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';
import { useRouter, usePathname } from 'expo-router';
import { useHapticFeedback } from '@/utils/haptics';

interface SmartBackButtonProps {
  size?: number;
  color?: string;
  style?: any;
  showLabel?: boolean;
  customOnPress?: () => void;
  disabled?: boolean;
}

const SmartBackButton: React.FC<SmartBackButtonProps> = ({
  size = 24,
  color,
  style,
  showLabel = false,
  customOnPress,
  disabled = false,
}) => {
  const colorScheme = useColorScheme() as ColorScheme;
  const { handleBackPress, canGoBack, navigationState } = useNavigationHistory();
  const router = useRouter();
  const pathname = usePathname();
  const haptics = useHapticFeedback();
  
  const [isPressed, setIsPressed] = useState(false);
  const [backLabel, setBackLabel] = useState('Back');
  const scaleAnim = new Animated.Value(1);
  
  const colors = Colors[colorScheme];
  const buttonColor = color || colors.text;
  const isDisabled = disabled || !canGoBack;

  useEffect(() => {
    // Determine smart back label based on current context
    const determineBackLabel = () => {
      if (pathname.includes('/manga/') && pathname.includes('/chapter/')) {
        return 'Manga';
      } else if (pathname.includes('/manga/')) {
        // Check if we came from search, home, or bookmarks
        const lastNonMangaRoute = navigationState.contextHistory
          .slice()
          .reverse()
          .find(entry => 
            !entry.path.includes('/manga/') || 
            (entry.path.includes('/manga/') && entry.path.includes('/chapter/'))
          );
        
        if (lastNonMangaRoute) {
          if (lastNonMangaRoute.path === '/mangasearch') return 'Search';
          if (lastNonMangaRoute.path === '/') return 'Home';
          if (lastNonMangaRoute.path === '/bookmarks') return 'Library';
          if (lastNonMangaRoute.path === '/settings') return 'Settings';
        }
        return 'Search'; // Default fallback for manga pages
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
  }, [pathname, navigationState]);

  const handlePress = async () => {
    if (isDisabled) return;
    
    haptics.onPress();
    
    // Animate button press
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
    
    if (customOnPress) {
      customOnPress();
    } else {
      try {
        await handleBackPress('tap');
      } catch (error) {
        console.error('Smart back navigation failed:', error);
        // Fallback to home if navigation fails
        router.replace('/');
      }
    }
  };

  const getBackgroundColor = () => {
    if (isDisabled) return 'transparent';
    if (isPressed) return colors.primary + '20';
    return 'transparent';
  };

  return (
    <TouchableOpacity
      style={[
        styles.container,
        {
          backgroundColor: getBackgroundColor(),
          opacity: isDisabled ? 0.3 : 1,
        },
        style,
      ]}
      onPress={handlePress}
      onPressIn={() => setIsPressed(true)}
      onPressOut={() => setIsPressed(false)}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={`Go back to ${backLabel}`}
      accessibilityHint={`Navigate back to the previous ${backLabel.toLowerCase()} page`}
    >
      <Animated.View 
        style={[
          styles.content,
          { transform: [{ scale: scaleAnim }] }
        ]}
      >
        <View style={styles.iconContainer}>
          <Ionicons
            name="arrow-back"
            size={size}
            color={buttonColor}
          />
          {navigationState.currentDepth > 1 && (
            <View style={[styles.depthIndicator, { backgroundColor: colors.primary }]}>
              <Text style={[styles.depthText, { color: colors.background }]}>
                {Math.min(navigationState.currentDepth - 1, 9)}
              </Text>
            </View>
          )}
        </View>
        
        {showLabel && (
          <Text style={[styles.label, { color: buttonColor }]}>
            {backLabel}
          </Text>
        )}
      </Animated.View>
    </TouchableOpacity>
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

export default SmartBackButton;