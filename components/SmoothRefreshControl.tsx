import React, { useRef, useEffect } from 'react';
import { RefreshControl, Animated, RefreshControlProps } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Colors } from '@/constants/Colors';
import { useHapticFeedback } from '@/utils/haptics';

interface SmoothRefreshControlProps extends RefreshControlProps {
  onRefresh: () => void;
  refreshing: boolean;
}

export const SmoothRefreshControl: React.FC<SmoothRefreshControlProps> = ({
  onRefresh,
  refreshing,
  ...props
}) => {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const haptics = useHapticFeedback();
  const rotationAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (refreshing) {
      // Trigger haptic feedback when refresh starts
      haptics.onSelection();
      
      // Start rotation animation
      Animated.loop(
        Animated.timing(rotationAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        })
      ).start();
    } else {
      // Stop animation and reset
      rotationAnim.stopAnimation();
      rotationAnim.setValue(0);
    }
  }, [refreshing, rotationAnim, haptics]);

  const handleRefresh = () => {
    haptics.onPress();
    onRefresh();
  };

  return (
    <RefreshControl
      refreshing={refreshing}
      onRefresh={handleRefresh}
      colors={[colors.primary]}
      tintColor={colors.primary}
      progressBackgroundColor={colors.card}
      progressViewOffset={0}
      {...props}
    />
  );
};