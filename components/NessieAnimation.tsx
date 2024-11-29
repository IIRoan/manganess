import React, { useRef, useEffect, useCallback } from 'react';
import { Animated, Easing, View, StyleSheet, ViewStyle } from 'react-native';

const CYCLE_DURATION = 8000; // 8 seconds for the full cycle
const MAX_RIGHT_DISTANCE = 80; // Maximum 80px to the right from starting position
const MIN_DELAY = 8000; // Minimum 8 seconds delay
const MAX_DELAY = 30000; // Maximum 30 seconds delay
const MIN_WALK_DISTANCE = 80;
const MAX_WALK_DISTANCE = 100;
const BACKFLIP_DURATION = 1000; // 1 second for the backflip
const BACKFLIP_CHANCE = 0.3; // 30% chance of backflip during delay

interface NessieAnimationProps {
  style?: ViewStyle;
  imageSize?: number;
}

export const NessieAnimation: React.FC<NessieAnimationProps> = ({ style, imageSize = 30 }) => {
  const progress = useRef(new Animated.Value(0)).current;
  const backflipRotation = useRef(new Animated.Value(0)).current;
  const walkDistance = useRef(0);
  const startPosition = useRef(0);

  const generateNewWalkCycle = useCallback(() => {
    const newWalkDistance = Math.floor(Math.random() * (MAX_WALK_DISTANCE - MIN_WALK_DISTANCE + 1) + MIN_WALK_DISTANCE);
    let newStartPosition = Math.max(0, Math.min(startPosition.current, MAX_RIGHT_DISTANCE - newWalkDistance));

    walkDistance.current = newWalkDistance;
    startPosition.current = newStartPosition;
  }, []);

  const performBackflip = useCallback(() => {
    Animated.timing(backflipRotation, {
      toValue: 1,
      duration: BACKFLIP_DURATION,
      easing: Easing.linear,
      useNativeDriver: true,
    }).start(() => {
      backflipRotation.setValue(0);
    });
  }, [backflipRotation]);

  const animateWithDelay = useCallback(() => {
    const delay = Math.random() * (MAX_DELAY - MIN_DELAY) + MIN_DELAY;
    
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(progress, {
        toValue: 1,
        duration: CYCLE_DURATION,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ]).start(({ finished }) => {
      if (finished) {
        progress.setValue(0);
        generateNewWalkCycle();
        if (Math.random() < BACKFLIP_CHANCE) {
          performBackflip();
        }
        animateWithDelay();
      }
    });
  }, [generateNewWalkCycle, progress, performBackflip]);

  useEffect(() => {
    generateNewWalkCycle();
    animateWithDelay();

    return () => {
      progress.stopAnimation();
      backflipRotation.stopAnimation();
    };
  }, [generateNewWalkCycle, animateWithDelay]);

  const translateX = progress.interpolate({
    inputRange: [0, 5/12, 1/2, 11/12, 1],
    outputRange: [
      startPosition.current,
      startPosition.current + walkDistance.current,
      startPosition.current + walkDistance.current,
      startPosition.current,
      startPosition.current
    ],
  });

  const scaleX = progress.interpolate({
    inputRange: [0, 5/12, 5/12 + 0.001, 11/12, 11/12 + 0.001, 1],
    outputRange: [1, 1, -1, -1, 1, 1],
  });

  const translateY = progress.interpolate({
    inputRange: [0, 1/24, 1/12, 1/4, 5/12, 1/2, 17/24, 3/4, 11/12, 1],
    outputRange: [0, -2, 0, -2, 0, 0, -2, 0, -2, 0],
    extrapolate: 'clamp',
  });

  const rotateY = backflipRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={[styles.container, style]}>
      <Animated.Image
        source={require('@/assets/images/nessie.png')}
        style={[
          styles.image,
          {
            width: imageSize,
            height: imageSize,
            transform: [
              { translateX },
              { translateY },
              { scaleX },
              { rotateY },
            ],
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  image: {
    resizeMode: 'contain',
  },
});
