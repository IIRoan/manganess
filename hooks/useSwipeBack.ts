import { useState, useRef, useCallback, useEffect } from 'react';
import { PanResponder, Animated, Dimensions, Platform } from 'react-native';
import { useNavigationHistory } from './useNavigationHistory';
import { NavigationGestureConfig } from '@/types/navigation';

interface UseSwipeBackProps {
    enabled?: boolean;
    config?: Partial<NavigationGestureConfig>;
    customOnSwipeBack?: () => void;
}

const DEFAULT_CONFIG: NavigationGestureConfig = {
    enabled: true,
    sensitivity: 0.5,
    edgeThreshold: 50,
    velocityThreshold: 100,
    distanceThreshold: 80,
};

export const useSwipeBack = ({
    enabled = true,
    config = {},
    customOnSwipeBack,
}: UseSwipeBackProps = {}) => {
    const { handleBackPress, canGoBack, settings } = useNavigationHistory();
    const [isSwipingBack, setIsSwipingBack] = useState(false);
    const [swipeDirection, setSwipeDirection] = useState<'back' | 'forward' | null>(null);
    const swipeProgress = useRef(new Animated.Value(0)).current;
    const swipeOpacity = useRef(new Animated.Value(0)).current;

    const gestureConfig = {
        ...DEFAULT_CONFIG,
        ...config,
        sensitivity: settings?.swipeSensitivity ?? DEFAULT_CONFIG.sensitivity,
        enabled: enabled && (settings?.enableGestures ?? true),
    };

    const { width: screenWidth } = Dimensions.get('window');
    const swipeThreshold = gestureConfig.distanceThreshold * gestureConfig.sensitivity;

    const handleSwipeBack = useCallback(async () => {
        if (customOnSwipeBack) {
            customOnSwipeBack();
        } else {
            await handleBackPress('swipe');
        }
    }, [customOnSwipeBack, handleBackPress]);

    const resetSwipeState = useCallback(() => {
        setIsSwipingBack(false);
        setSwipeDirection(null);
        Animated.parallel([
            Animated.timing(swipeProgress, {
                toValue: 0,
                duration: 200,
                useNativeDriver: false,
            }),
            Animated.timing(swipeOpacity, {
                toValue: 0,
                duration: 200,
                useNativeDriver: false,
            }),
        ]).start();
    }, [swipeProgress, swipeOpacity]);

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: (evt) => {
                if (!gestureConfig.enabled || !canGoBack) return false;
                
                const { locationX } = evt.nativeEvent;
                const isFromEdge = locationX <= gestureConfig.edgeThreshold;
                
                // On iOS, be more lenient with edge detection
                if (Platform.OS === 'ios') {
                    return isFromEdge || locationX <= gestureConfig.edgeThreshold * 1.5;
                }
                
                return isFromEdge;
            },
            onMoveShouldSetPanResponder: (evt, gestureState) => {
                if (!gestureConfig.enabled || !canGoBack) return false;
                
                const { locationX } = evt.nativeEvent;
                const isFromEdge = locationX <= gestureConfig.edgeThreshold;
                const isHorizontalSwipe = Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
                const isMovingRight = gestureState.dx > 10;
                
                return isFromEdge && isHorizontalSwipe && isMovingRight;
            },
            onPanResponderGrant: () => {
                setIsSwipingBack(true);
                setSwipeDirection('back');
                swipeProgress.setValue(0);
                
                Animated.timing(swipeOpacity, {
                    toValue: 1,
                    duration: 100,
                    useNativeDriver: false,
                }).start();
            },
            onPanResponderMove: (_, gestureState) => {
                if (!isSwipingBack) return;
                
                const progress = Math.max(0, Math.min(gestureState.dx / swipeThreshold, 1));
                swipeProgress.setValue(progress);
                
                // Update opacity based on progress
                const opacity = Math.min(progress * 2, 1);
                swipeOpacity.setValue(opacity);
            },
            onPanResponderRelease: (_, gestureState) => {
                if (!isSwipingBack) return;
                
                const { dx, vx } = gestureState;
                const shouldTriggerSwipe = 
                    dx > swipeThreshold || 
                    (dx > swipeThreshold * 0.5 && vx > gestureConfig.velocityThreshold);
                
                if (shouldTriggerSwipe) {
                    // Animate to completion
                    Animated.parallel([
                        Animated.timing(swipeProgress, {
                            toValue: 1,
                            duration: 150,
                            useNativeDriver: false,
                        }),
                        Animated.timing(swipeOpacity, {
                            toValue: 0,
                            duration: 150,
                            useNativeDriver: false,
                        }),
                    ]).start(() => {
                        handleSwipeBack();
                        setTimeout(resetSwipeState, 100);
                    });
                } else {
                    resetSwipeState();
                }
            },
            onPanResponderTerminate: resetSwipeState,
        })
    ).current;

    // Update panResponder when config changes
    useEffect(() => {
        // Force re-creation of panResponder with new config
        // This is handled by the dependency on gestureConfig in the panResponder creation
    }, [gestureConfig.enabled, canGoBack]);

    const getSwipeStyles = useCallback(() => {
        return {
            transform: [
                {
                    translateX: swipeProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0, screenWidth * 0.3],
                    }),
                },
            ],
        };
    }, [swipeProgress, screenWidth]);

    const getIndicatorStyles = useCallback(() => {
        return {
            opacity: swipeOpacity,
            transform: [
                {
                    translateX: swipeProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: [-50, 20],
                    }),
                },
                {
                    scale: swipeProgress.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.8, 1.1, 1],
                    }),
                },
            ],
        };
    }, [swipeOpacity, swipeProgress]);

    return {
        panResponder,
        isSwipingBack,
        swipeDirection,
        swipeProgress,
        swipeOpacity,
        canSwipeBack: gestureConfig.enabled && canGoBack,
        config: gestureConfig,
        getSwipeStyles,
        getIndicatorStyles,
        resetSwipeState,
    };
};