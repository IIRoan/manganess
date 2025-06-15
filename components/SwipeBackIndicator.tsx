import React from 'react';
import {
  Animated,
  StyleSheet,
  Dimensions,
  useColorScheme,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';

import { Colors, ColorScheme } from '@/constants/Colors';

const { height, width } = Dimensions.get('window');

interface SwipeBackIndicatorProps {
  swipeProgress?: Animated.Value;
  swipeOpacity?: Animated.Value;
  isVisible?: boolean;
  customStyles?: any;
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
}

const SwipeBackIndicator: React.FC<SwipeBackIndicatorProps> = ({
  swipeProgress,
  swipeOpacity,
  isVisible = false,
  customStyles,
  size = 'medium',
  showText = false,
}) => {
  const colorScheme = useColorScheme() as ColorScheme;
  const arrowColor = Colors[colorScheme].primary;
  const textColor = Colors[colorScheme].text;

  const sizeConfig = {
    small: { iconSize: 20, containerSize: 40 },
    medium: { iconSize: 30, containerSize: 60 },
    large: { iconSize: 40, containerSize: 80 },
  };

  const config = sizeConfig[size];

  const animatedStyle = swipeProgress && swipeOpacity ? {
    transform: [
      {
        translateX: swipeProgress.interpolate({
          inputRange: [0, 1],
          outputRange: [-config.containerSize, 20],
        }),
      },
      {
        scale: swipeProgress.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0.8, 1.1, 1],
        }),
      },
    ],
    opacity: swipeOpacity,
  } : {};

  const staticStyle = isVisible ? {
    opacity: 1,
    transform: [{ translateX: 0 }],
  } : {
    opacity: 0,
    transform: [{ translateX: -config.containerSize }],
  };

  const finalStyle = swipeProgress ? animatedStyle : staticStyle;

  return (
    <Animated.View style={[
      indicatorStyles.container,
      {
        width: config.containerSize,
        height: config.containerSize,
        borderRadius: config.containerSize / 2,
      },
      finalStyle,
      customStyles,
    ]}>
      <BlurView
        intensity={80}
        tint={colorScheme === 'dark' ? 'dark' : 'light'}
        style={indicatorStyles.blurContainer}
      >
        <View style={indicatorStyles.iconContainer}>
          <Ionicons 
            name="arrow-back" 
            size={config.iconSize} 
            color={arrowColor} 
          />
        </View>
        {showText && (
          <Animated.Text 
            style={[
              indicatorStyles.text,
              { color: textColor },
              swipeProgress ? {
                opacity: swipeProgress.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, 1, 0],
                }),
              } : {}
            ]}
          >
            Go Back
          </Animated.Text>
        )}
      </BlurView>
    </Animated.View>
  );
};

interface SwipeGestureOverlayProps {
  enabled?: boolean;
  children: React.ReactNode;
  panResponder?: any;
  swipeProgress?: Animated.Value;
  swipeOpacity?: Animated.Value;
  isSwipingBack?: boolean;
}

export const SwipeGestureOverlay: React.FC<SwipeGestureOverlayProps> = ({
  enabled = true,
  children,
  panResponder,
  swipeProgress,
  swipeOpacity,
  isSwipingBack = false,
}) => {
  if (!enabled || !panResponder) {
    return <>{children}</>;
  }

  return (
    <View style={indicatorStyles.overlay} {...panResponder.panHandlers}>
      {children}
      {isSwipingBack && swipeProgress && swipeOpacity && (
        <>
          <SwipeBackIndicator
            swipeProgress={swipeProgress}
            swipeOpacity={swipeOpacity}
            size="medium"
          />
          <Animated.View
            style={[
              indicatorStyles.screenOverlay,
              {
                opacity: swipeProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 0.1],
                }),
              },
            ]}
          />
        </>
      )}
    </View>
  );
};

const indicatorStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: height / 2 - 40,
    left: 20,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 1000,
  },
  blurContainer: {
    width: '100%',
    height: '100%',
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
  },
  screenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#000',
    pointerEvents: 'none',
  },
});

export default SwipeBackIndicator;
