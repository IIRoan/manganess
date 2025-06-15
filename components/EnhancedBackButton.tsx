import React, { useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Pressable,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';
import NavigationHistoryPanel from './NavigationHistoryPanel';

interface EnhancedBackButtonProps {
  size?: number;
  color?: string;
  style?: any;
  showHistoryOnLongPress?: boolean;
  customOnPress?: () => void;
  disabled?: boolean;
}

const EnhancedBackButton: React.FC<EnhancedBackButtonProps> = ({
  size = 24,
  color,
  style,
  showHistoryOnLongPress = true,
  customOnPress,
  disabled = false,
}) => {
  const colorScheme = useColorScheme() as ColorScheme;
  const { handleBackPress, canGoBack, currentDepth } = useNavigationHistory();
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  
  const colors = Colors[colorScheme];
  const buttonColor = color || colors.text;
  const isDisabled = disabled || !canGoBack;

  const handlePress = async () => {
    if (isDisabled) return;
    
    if (customOnPress) {
      customOnPress();
    } else {
      await handleBackPress('tap');
    }
  };

  const handleLongPress = () => {
    if (isDisabled || !showHistoryOnLongPress) return;
    setShowHistoryPanel(true);
  };

  const getBackgroundColor = () => {
    if (isDisabled) return 'transparent';
    if (isPressed) return colors.primary + '20';
    return 'transparent';
  };

  return (
    <>
      <Pressable
        style={[
          styles.container,
          {
            backgroundColor: getBackgroundColor(),
            opacity: isDisabled ? 0.3 : 1,
          },
          style,
        ]}
        onPress={handlePress}
        onLongPress={handleLongPress}
        onPressIn={() => setIsPressed(true)}
        onPressOut={() => setIsPressed(false)}
        disabled={isDisabled}
        delayLongPress={500}
      >
        <View style={styles.iconContainer}>
          <Ionicons
            name="arrow-back"
            size={size}
            color={buttonColor}
          />
          {currentDepth > 1 && (
            <View style={[styles.depthIndicator, { backgroundColor: colors.primary }]}>
              <Ionicons
                name="ellipsis-horizontal"
                size={size * 0.5}
                color={colors.background}
              />
            </View>
          )}
        </View>
      </Pressable>

      <NavigationHistoryPanel
        visible={showHistoryPanel}
        onClose={() => setShowHistoryPanel(false)}
      />
    </>
  );
};

interface FloatingBackButtonProps extends EnhancedBackButtonProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  offset?: { x: number; y: number };
}

export const FloatingBackButton: React.FC<FloatingBackButtonProps> = ({
  position = 'top-left',
  offset = { x: 20, y: 60 },
  size = 28,
  ...props
}) => {
  const colorScheme = useColorScheme() as ColorScheme;
  const colors = Colors[colorScheme];

  const getPositionStyle = () => {
    const baseStyle = {
      position: 'absolute' as const,
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.card,
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
        return { ...baseStyle, top: offset.y, left: offset.x };
      case 'top-right':
        return { ...baseStyle, top: offset.y, right: offset.x };
      case 'bottom-left':
        return { ...baseStyle, bottom: offset.y, left: offset.x };
      case 'bottom-right':
        return { ...baseStyle, bottom: offset.y, right: offset.x };
      default:
        return { ...baseStyle, top: offset.y, left: offset.x };
    }
  };

  return (
    <EnhancedBackButton
      {...props}
      size={size}
      style={getPositionStyle()}
    />
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
  iconContainer: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  depthIndicator: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default EnhancedBackButton;