import { useState, useRef, useCallback } from 'react';
import { PanResponder, Animated, Dimensions } from 'react-native';

interface UseSwipeBackProps {
    onSwipeBack: () => void;
    swipeThreshold?: number;
    edgeWidth?: number;
}

export const useSwipeBack = ({
    onSwipeBack,
    swipeThreshold = 50,
    edgeWidth = 50,
}: UseSwipeBackProps) => {
    const [isSwipingBack, setIsSwipingBack] = useState(false);
    const swipeProgress = useRef(new Animated.Value(0)).current;

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: (evt) => {
                const { locationX } = evt.nativeEvent;
                return locationX <= edgeWidth;
            },
            onMoveShouldSetPanResponder: (evt) => {
                const { locationX } = evt.nativeEvent;
                return locationX <= edgeWidth;
            },
            onPanResponderGrant: () => {
                setIsSwipingBack(true);
                swipeProgress.setValue(0);
            },
            onPanResponderMove: (_, gestureState) => {
                const progress = Math.min(gestureState.dx / swipeThreshold, 1);
                swipeProgress.setValue(progress);
            },
            onPanResponderRelease: (_, gestureState) => {
                setIsSwipingBack(false);
                if (gestureState.dx > swipeThreshold) {
                    Animated.timing(swipeProgress, {
                        toValue: 1,
                        duration: 200,
                        useNativeDriver: false,
                    }).start(() => {
                        onSwipeBack();
                    });
                } else {
                    Animated.timing(swipeProgress, {
                        toValue: 0,
                        duration: 200,
                        useNativeDriver: false,
                    }).start();
                }
            },
            onPanResponderTerminate: () => {
                setIsSwipingBack(false);
                Animated.timing(swipeProgress, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: false,
                }).start();
            },
        })
    ).current;

    return {
        panResponder,
        isSwipingBack,
        swipeProgress,
    };
};