import React, { useRef, useEffect } from 'react';
import { Animated, ViewStyle } from 'react-native';

interface PageTransitionProps {
  children: React.ReactNode;
  style?: ViewStyle;
  transitionType?: 'fade' | 'slide' | 'scale';
  duration?: number;
  delay?: number;
}

export const PageTransition: React.FC<PageTransitionProps> = ({
  children,
  style,
  transitionType = 'fade',
  duration = 300,
  delay = 0,
}) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(50)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const animations: Animated.CompositeAnimation[] = [];

    if (transitionType === 'fade' || transitionType === 'slide' || transitionType === 'scale') {
      animations.push(
        Animated.timing(opacity, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        })
      );
    }

    if (transitionType === 'slide') {
      animations.push(
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        })
      );
    }

    if (transitionType === 'scale') {
      animations.push(
        Animated.timing(scale, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        })
      );
    }

    const animation = Animated.parallel(animations);

    const timer = setTimeout(() => {
      animation.start();
    }, delay);

    return () => {
      clearTimeout(timer);
      animation.stop();
    };
  }, [transitionType, duration, delay, opacity, translateY, scale]);

  const getAnimatedStyle = () => {
    const baseStyle = { opacity };

    switch (transitionType) {
      case 'slide':
        return {
          ...baseStyle,
          transform: [{ translateY }],
        };
      case 'scale':
        return {
          ...baseStyle,
          transform: [{ scale }],
        };
      default:
        return baseStyle;
    }
  };

  return (
    <Animated.View style={[getAnimatedStyle(), style]}>
      {children}
    </Animated.View>
  );
};

// Hook for page transitions
export const usePageTransition = (
  transitionType: 'fade' | 'slide' | 'scale' = 'fade',
  duration: number = 300
) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(50)).current;
  const scale = useRef(new Animated.Value(0.9)).current;

  const animateIn = () => {
    const animations: Animated.CompositeAnimation[] = [
      Animated.timing(opacity, {
        toValue: 1,
        duration,
        useNativeDriver: true,
      }),
    ];

    if (transitionType === 'slide') {
      animations.push(
        Animated.timing(translateY, {
          toValue: 0,
          duration,
          useNativeDriver: true,
        })
      );
    }

    if (transitionType === 'scale') {
      animations.push(
        Animated.timing(scale, {
          toValue: 1,
          duration,
          useNativeDriver: true,
        })
      );
    }

    Animated.parallel(animations).start();
  };

  const animateOut = () => {
    const animations: Animated.CompositeAnimation[] = [
      Animated.timing(opacity, {
        toValue: 0,
        duration: duration / 2,
        useNativeDriver: true,
      }),
    ];

    if (transitionType === 'slide') {
      animations.push(
        Animated.timing(translateY, {
          toValue: -50,
          duration: duration / 2,
          useNativeDriver: true,
        })
      );
    }

    if (transitionType === 'scale') {
      animations.push(
        Animated.timing(scale, {
          toValue: 0.8,
          duration: duration / 2,
          useNativeDriver: true,
        })
      );
    }

    return Animated.parallel(animations);
  };

  const getAnimatedStyle = () => {
    const baseStyle = { opacity };

    switch (transitionType) {
      case 'slide':
        return {
          ...baseStyle,
          transform: [{ translateY }],
        };
      case 'scale':
        return {
          ...baseStyle,
          transform: [{ scale }],
        };
      default:
        return baseStyle;
    }
  };

  return {
    animateIn,
    animateOut,
    animatedStyle: getAnimatedStyle(),
  };
};