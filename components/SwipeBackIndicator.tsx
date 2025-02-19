import React from 'react';
import {
  Animated,
  StyleSheet,
  Dimensions,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { Colors, ColorScheme } from '@/constants/Colors';

const { height } = Dimensions.get('window');

interface SwipeBackIndicatorProps {
  swipeProgress: Animated.Value;
}

const SwipeBackIndicator: React.FC<SwipeBackIndicatorProps> = ({
  swipeProgress,
}) => {
  const colorScheme = useColorScheme() as ColorScheme;
  const arrowColor = Colors[colorScheme].primary;

  const arrowStyle = {
    transform: [
      {
        translateX: swipeProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [-50, 0],
        }),
      },
    ],
    opacity: swipeProgress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 1],
    }),
  };

  return (
    <Animated.View style={[indicatorStyles.container, arrowStyle]}>
      <Ionicons name="arrow-back" size={30} color={arrowColor} />
    </Animated.View>
  );
};

const indicatorStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 50,
    height: height,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
});

export default SwipeBackIndicator;
