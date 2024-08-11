import React, { useRef, useEffect } from 'react';
import { Animated, Easing } from 'react-native';

export const useNessieAnimation = () => {
  const nessieX = useRef(new Animated.Value(0)).current;
  const nessieY = useRef(new Animated.Value(0)).current;
  const bobY = useRef(new Animated.Value(0)).current;

  const animateNessie = () => {
    const duration = 2000;
    const easing = Easing.bezier(0.4, 0.0, 0.2, 1);

    const wanderOff = () => {
      const targetX = Math.random() * 40 - 20;
      const targetY = Math.random() * 40 - 20;

      return Animated.parallel([
        Animated.timing(nessieX, {
          toValue: targetX,
          duration: duration,
          easing: easing,
          useNativeDriver: true,
        }),
        Animated.timing(nessieY, {
          toValue: targetY,
          duration: duration,
          easing: easing,
          useNativeDriver: true,
        }),
      ]);
    };

    const comeBack = () => {
      return Animated.parallel([
        Animated.timing(nessieX, {
          toValue: 0,
          duration: duration,
          easing: easing,
          useNativeDriver: true,
        }),
        Animated.timing(nessieY, {
          toValue: 0,
          duration: duration,
          easing: easing,
          useNativeDriver: true,
        }),
      ]);
    };

    const bob = () => {
      return Animated.loop(
        Animated.sequence([
          Animated.timing(bobY, {
            toValue: -3,
            duration: 500,
            easing: Easing.sine,
            useNativeDriver: true,
          }),
          Animated.timing(bobY, {
            toValue: 3,
            duration: 300,
            easing: Easing.sine,
            useNativeDriver: true,
          }),
          Animated.delay(9000), // Add a delay between bobs
        ]),
        { iterations: -1 } // Loop indefinitely
      );
    };

    Animated.parallel([
      Animated.sequence([
        wanderOff(),
        Animated.delay(1000),
        comeBack(),
        Animated.delay(1000),
      ]),
      bob(),
    ]).start(() => {
      animateNessie(); // Start the next cycle
    });
  };

  useEffect(() => {
    animateNessie();
    return () => {
      // Clean up animations when component unmounts
      nessieX.stopAnimation();
      nessieY.stopAnimation();
      bobY.stopAnimation();
    };
  }, []);

  return { nessieX, nessieY, bobY };
};
