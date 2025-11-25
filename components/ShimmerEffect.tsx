import React, { useEffect, useRef } from 'react';
import {
  Animated,
  View,
  ViewStyle,
  DimensionValue,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/constants/ThemeContext';
// import { Colors } from '@/constants/Colors';

interface ShimmerEffectProps {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export const ShimmerEffect: React.FC<ShimmerEffectProps> = ({
  width = 100,
  height = 20,
  borderRadius = 4,
  style,
}) => {
  const { actualTheme } = useTheme();
  const shimmerAnimation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startShimmer = () => {
      shimmerAnimation.setValue(0);
      Animated.loop(
        Animated.timing(shimmerAnimation, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    };

    startShimmer();
  }, [shimmerAnimation]);

  const translateX = shimmerAnimation.interpolate({
    inputRange: [0, 1],
    outputRange: [-300, 300],
  });

  const baseColor = actualTheme === 'dark' ? '#2C2C2E' : '#F2F2F7';
  const highlightColor = actualTheme === 'dark' ? '#3C3C3E' : '#FFFFFF';

  return (
    <View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: baseColor,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <Animated.View
        style={{
          width: '100%',
          height: '100%',
          transform: [{ translateX }],
        }}
      >
        <LinearGradient
          colors={[baseColor, highlightColor, baseColor]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{
            width: 300,
            height: '100%',
          }}
        />
      </Animated.View>
    </View>
  );
};

// Convenience components for common use cases
export const ShimmerCard: React.FC<{ style?: ViewStyle }> = ({ style }) => (
  <View style={style}>
    <ShimmerEffect width="100%" height={200} borderRadius={12} />
    <ShimmerEffect width="80%" height={16} style={{ marginTop: 8 }} />
    <ShimmerEffect width="60%" height={12} style={{ marginTop: 4 }} />
  </View>
);

export const ShimmerText: React.FC<{
  lines?: number;
  width?: DimensionValue;
  style?: ViewStyle;
}> = ({ lines = 3, width = '100%' as DimensionValue, style }) => (
  <View style={style}>
    {Array.from({ length: lines }).map((_, index) => (
      <ShimmerEffect
        key={index}
        width={index === lines - 1 ? ('70%' as DimensionValue) : width}
        height={16}
        style={{ marginBottom: index < lines - 1 ? 8 : 0 }}
      />
    ))}
  </View>
);
