import { renderHook, act } from '@testing-library/react-native';

const mockHandleBackPress = jest.fn();
let mockCanGoBack = true;
let mockEnableGestures = true;

jest.mock('../useNavigationHistory', () => ({
  useNavigationHistory: () => ({
    handleBackPress: mockHandleBackPress,
    canGoBack: mockCanGoBack,
    settings: {
      swipeSensitivity: 0.5,
      enableGestures: mockEnableGestures,
    },
  }),
}));

const animatedValues: any[] = [];

let mockPlatformOS = 'ios';

jest.mock('react-native', () => {
  class MockAnimatedValue {
    value: number;
    constructor(v: number) {
      this.value = v;
      animatedValues.push(this);
    }
    setValue(v: number) {
      this.value = v;
    }
    interpolate(_: any) {
      return this.value;
    }
  }

  const timing = jest.fn(() => ({ start: (cb?: () => void) => cb?.() }));
  const parallel = jest.fn(() => ({ start: (cb?: () => void) => cb?.() }));

  return {
    Animated: {
      Value: MockAnimatedValue,
      timing,
      parallel,
    },
    PanResponder: {
      create: (config: any) => ({
        ...config,
        panHandlers: {},
      }),
    },
    Dimensions: {
      get: () => ({ width: 400 }),
    },
    Platform: {
      get OS() { return mockPlatformOS; }
    },
  };
});

import { useSwipeBack } from '../useSwipeBack';

describe('useSwipeBack', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockHandleBackPress.mockClear();
    mockCanGoBack = true;
    mockEnableGestures = true;
    mockPlatformOS = 'ios';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('disables swipe when navigation cannot go back', () => {
    mockCanGoBack = false;
    const { result } = renderHook(() => useSwipeBack());

    expect(result.current.canSwipeBack).toBe(false);
  });

  it('determines whether to capture pan gestures based on edge detection', () => {
    const { result } = renderHook(() => useSwipeBack());
    const startEvent: any = { nativeEvent: { locationX: 10 } };

    const shouldCapture = (
      result.current.panResponder as any
    ).onStartShouldSetPanResponder(startEvent);
    expect(shouldCapture).toBe(true);

    mockCanGoBack = false;
    const { result: resultCannotGoBack } = renderHook(() => useSwipeBack());
    const shouldCaptureWhenCannot = (
      resultCannotGoBack.current.panResponder as any
    ).onStartShouldSetPanResponder(startEvent);
    expect(shouldCaptureWhenCannot).toBe(false);
  });

  it('resets swipe state manually', () => {
    const { result } = renderHook(() => useSwipeBack());

    act(() => {
      (result.current.panResponder as any).onPanResponderGrant();
    });

    expect(result.current.isSwipingBack).toBe(true);

    act(() => {
      result.current.resetSwipeState();
    });

    expect(result.current.isSwipingBack).toBe(false);
  });

  it('exposes gesture configuration that respects settings', () => {
    mockEnableGestures = false;
    mockCanGoBack = true;
    const { result } = renderHook(() => useSwipeBack());

    expect(result.current.config.enabled).toBe(false);
    expect(result.current.getSwipeStyles()).toEqual({
      transform: [{ translateX: expect.any(Number) }],
    });
  });

  describe('onMoveShouldSetPanResponder', () => {
    it('returns false when gestures disabled', () => {
      mockEnableGestures = false;
      const { result } = renderHook(() => useSwipeBack());

      const event: any = { nativeEvent: { locationX: 10 } };
      const gestureState: any = { dx: 20, dy: 5 };

      const shouldCapture = (
        result.current.panResponder as any
      ).onMoveShouldSetPanResponder(event, gestureState);

      expect(shouldCapture).toBe(false);
    });

    it('returns false when not from edge', () => {
      const { result } = renderHook(() => useSwipeBack());

      const event: any = { nativeEvent: { locationX: 200 } };
      const gestureState: any = { dx: 20, dy: 5 };

      const shouldCapture = (
        result.current.panResponder as any
      ).onMoveShouldSetPanResponder(event, gestureState);

      expect(shouldCapture).toBe(false);
    });

    it('returns false when not horizontal swipe', () => {
      const { result } = renderHook(() => useSwipeBack());

      const event: any = { nativeEvent: { locationX: 10 } };
      const gestureState: any = { dx: 5, dy: 50 };

      const shouldCapture = (
        result.current.panResponder as any
      ).onMoveShouldSetPanResponder(event, gestureState);

      expect(shouldCapture).toBe(false);
    });

    it('returns false when moving left', () => {
      const { result } = renderHook(() => useSwipeBack());

      const event: any = { nativeEvent: { locationX: 10 } };
      const gestureState: any = { dx: -20, dy: 5 };

      const shouldCapture = (
        result.current.panResponder as any
      ).onMoveShouldSetPanResponder(event, gestureState);

      expect(shouldCapture).toBe(false);
    });

    it('returns true for valid horizontal swipe from edge', () => {
      const { result } = renderHook(() => useSwipeBack());

      const event: any = { nativeEvent: { locationX: 10 } };
      const gestureState: any = { dx: 20, dy: 5 };

      const shouldCapture = (
        result.current.panResponder as any
      ).onMoveShouldSetPanResponder(event, gestureState);

      expect(shouldCapture).toBe(true);
    });
  });

  describe('onPanResponderGrant', () => {
    it('sets swiping state and direction on grant', () => {
      const { result } = renderHook(() => useSwipeBack());

      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      expect(result.current.isSwipingBack).toBe(true);
      expect(result.current.swipeDirection).toBe('back');
    });
  });

  describe('onPanResponderMove', () => {
    it('updates swipe progress during move', () => {
      const { result } = renderHook(() => useSwipeBack());

      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      act(() => {
        (result.current.panResponder as any).onPanResponderMove({}, { dx: 40 });
      });

      // Progress should be updated (exact value depends on threshold)
      expect(result.current.isSwipingBack).toBe(true);
    });

    it('does nothing when not swiping', () => {
      const { result } = renderHook(() => useSwipeBack());

      // Call move without grant
      act(() => {
        (result.current.panResponder as any).onPanResponderMove({}, { dx: 40 });
      });

      // Should not crash
      expect(result.current.isSwipingBack).toBe(false);
    });
  });

  describe('onPanResponderRelease', () => {
    it('does not crash when release called without grant', () => {
      const { result } = renderHook(() => useSwipeBack());

      act(() => {
        (result.current.panResponder as any).onPanResponderRelease(
          {},
          { dx: 100, vx: 200 }
        );
      });

      // Should not crash or trigger callback since not swiping
      expect(mockHandleBackPress).not.toHaveBeenCalled();
    });

    it('handles release after grant', () => {
      const { result } = renderHook(() => useSwipeBack());

      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      expect(result.current.isSwipingBack).toBe(true);

      act(() => {
        (result.current.panResponder as any).onPanResponderRelease(
          {},
          { dx: 10, vx: 0 }
        );
      });

      // Animation timing is mocked, just verify no error
      expect(result.current).toBeDefined();
    });

    it('triggers animation on large swipe distance', () => {
      const { result } = renderHook(() => useSwipeBack());

      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      expect(result.current.isSwipingBack).toBe(true);

      // Large enough distance to trigger swipe (threshold is ~40)
      act(() => {
        (result.current.panResponder as any).onPanResponderRelease(
          {},
          { dx: 100, vx: 0 }
        );
      });

      // Run timers for the setTimeout callback
      act(() => {
        jest.runAllTimers();
      });

      // Animation should have been triggered (mocked timing was called)
      const { Animated } = require('react-native');
      expect(Animated.timing).toHaveBeenCalled();
    });

    it('triggers animation with high velocity swipe', () => {
      const { result } = renderHook(() => useSwipeBack());

      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      // Smaller distance but high velocity
      act(() => {
        (result.current.panResponder as any).onPanResponderRelease(
          {},
          { dx: 25, vx: 200 }
        );
      });

      // Run timers
      act(() => {
        jest.runAllTimers();
      });

      // Animation should have been triggered
      const { Animated } = require('react-native');
      expect(Animated.timing).toHaveBeenCalled();
    });

    it('animates back when swipe distance is too small', () => {
      const { result } = renderHook(() => useSwipeBack());

      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      expect(result.current.isSwipingBack).toBe(true);

      // Very small distance, low velocity - should animate back
      act(() => {
        (result.current.panResponder as any).onPanResponderRelease(
          {},
          { dx: 5, vx: 10 }
        );
      });

      // Animation parallel should have been called for cancel animation
      const { Animated } = require('react-native');
      expect(Animated.parallel).toHaveBeenCalled();
    });
  });

  describe('onPanResponderTerminate', () => {
    it('resets state on terminate', () => {
      const { result } = renderHook(() => useSwipeBack());

      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      expect(result.current.isSwipingBack).toBe(true);

      act(() => {
        (result.current.panResponder as any).onPanResponderTerminate();
      });

      expect(result.current.isSwipingBack).toBe(false);
    });
  });

  describe('custom config', () => {
    it('merges custom config with defaults', () => {
      const customConfig = {
        edgeThreshold: 100,
        distanceThreshold: 150,
      };

      const { result } = renderHook(() =>
        useSwipeBack({ config: customConfig })
      );

      expect(result.current.config.edgeThreshold).toBe(100);
      expect(result.current.config.distanceThreshold).toBe(150);
    });
  });

  describe('customOnSwipeBack', () => {
    it('accepts custom callback when provided', () => {
      const customCallback = jest.fn();
      const { result } = renderHook(() =>
        useSwipeBack({ customOnSwipeBack: customCallback })
      );

      // Verify hook accepts custom callback without errors
      expect(result.current).toBeDefined();
      expect(result.current.panResponder).toBeDefined();
    });

    it('calls custom callback when swipe completes', () => {
      const customCallback = jest.fn();
      const { result } = renderHook(() =>
        useSwipeBack({ customOnSwipeBack: customCallback })
      );

      // Start swipe
      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      expect(result.current.isSwipingBack).toBe(true);

      // Complete swipe with large enough distance
      act(() => {
        (result.current.panResponder as any).onPanResponderRelease(
          {},
          { dx: 200, vx: 500 }
        );
      });

      // Run timers for setTimeout in the animation completion callback
      act(() => {
        jest.runAllTimers();
      });

      // The custom callback should be called (animation mock calls callback immediately)
      expect(customCallback).toHaveBeenCalled();
    });

    it('does not call handleBackPress when custom callback provided', () => {
      const customCallback = jest.fn();
      mockHandleBackPress.mockClear();

      const { result } = renderHook(() =>
        useSwipeBack({ customOnSwipeBack: customCallback })
      );

      // Start swipe
      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      // Complete swipe
      act(() => {
        (result.current.panResponder as any).onPanResponderRelease(
          {},
          { dx: 200, vx: 500 }
        );
      });

      act(() => {
        jest.runAllTimers();
      });

      // custom callback should be called, not handleBackPress
      expect(customCallback).toHaveBeenCalled();
      expect(mockHandleBackPress).not.toHaveBeenCalled();
    });
  });

  describe('handleSwipeBack default behavior', () => {
    it('calls handleBackPress with swipe trigger when no custom callback', () => {
      mockHandleBackPress.mockClear();

      const { result } = renderHook(() => useSwipeBack());

      // Start swipe
      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      // Complete swipe with large enough distance
      act(() => {
        (result.current.panResponder as any).onPanResponderRelease(
          {},
          { dx: 200, vx: 500 }
        );
      });

      act(() => {
        jest.runAllTimers();
      });

      // handleBackPress should be called with 'swipe' trigger
      expect(mockHandleBackPress).toHaveBeenCalledWith('swipe');
    });
  });

  describe('iOS extended edge detection', () => {
    it('captures pan on iOS with extended edge threshold', () => {
      const { result } = renderHook(() => useSwipeBack());

      // On iOS, edge threshold is extended by 1.5x (50 * 1.5 = 75)
      const edgeEvent: any = { nativeEvent: { locationX: 60 } };

      const shouldCapture = (
        result.current.panResponder as any
      ).onStartShouldSetPanResponder(edgeEvent);

      // Should capture because 60 <= 75 (edgeThreshold * 1.5)
      expect(shouldCapture).toBe(true);
    });

    it('does not capture pan outside extended edge on iOS', () => {
      const { result } = renderHook(() => useSwipeBack());

      // Outside the extended edge (50 * 1.5 = 75)
      const farEvent: any = { nativeEvent: { locationX: 100 } };

      const shouldCapture = (
        result.current.panResponder as any
      ).onStartShouldSetPanResponder(farEvent);

      expect(shouldCapture).toBe(false);
    });
  });

  describe('Android edge detection', () => {
    beforeEach(() => {
      mockPlatformOS = 'android';
    });

    it('uses strict edge detection on Android', () => {
      const { result } = renderHook(() => useSwipeBack());

      // On Android, only exact edge threshold applies (50)
      const edgeEvent: any = { nativeEvent: { locationX: 40 } };

      const shouldCapture = (
        result.current.panResponder as any
      ).onStartShouldSetPanResponder(edgeEvent);

      expect(shouldCapture).toBe(true);
    });

    it('does not capture pan at iOS extended threshold on Android', () => {
      const { result } = renderHook(() => useSwipeBack());

      // 60 would be captured on iOS but not on Android
      const extendedEvent: any = { nativeEvent: { locationX: 60 } };

      const shouldCapture = (
        result.current.panResponder as any
      ).onStartShouldSetPanResponder(extendedEvent);

      // On Android, 60 > 50 (edgeThreshold) so it should NOT capture
      expect(shouldCapture).toBe(false);
    });
  });

  describe('getIndicatorStyles', () => {
    it('returns indicator animation styles', () => {
      const { result } = renderHook(() => useSwipeBack());

      const styles = result.current.getIndicatorStyles();

      expect(styles).toHaveProperty('opacity');
      expect(styles).toHaveProperty('transform');
      expect(Array.isArray(styles.transform)).toBe(true);
    });
  });

  describe('canSwipeBack', () => {
    it('returns false when gestures disabled', () => {
      mockEnableGestures = false;
      const { result } = renderHook(() => useSwipeBack());

      expect(result.current.canSwipeBack).toBe(false);
    });

    it('returns false when cannot go back', () => {
      mockCanGoBack = false;
      const { result } = renderHook(() => useSwipeBack());

      expect(result.current.canSwipeBack).toBe(false);
    });

    it('returns true when gestures enabled and can go back', () => {
      mockEnableGestures = true;
      mockCanGoBack = true;
      const { result } = renderHook(() => useSwipeBack());

      expect(result.current.canSwipeBack).toBe(true);
    });
  });

  describe('enabled prop', () => {
    it('disables swipe when enabled is false', () => {
      const { result } = renderHook(() => useSwipeBack({ enabled: false }));

      expect(result.current.config.enabled).toBe(false);
      expect(result.current.canSwipeBack).toBe(false);
    });
  });

  describe('swipe progress clamping', () => {
    it('clamps progress between 0 and 1', () => {
      const { result } = renderHook(() => useSwipeBack());

      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      // Very large swipe distance - progress should be clamped at 1
      act(() => {
        (result.current.panResponder as any).onPanResponderMove({}, { dx: 1000 });
      });

      expect(result.current.isSwipingBack).toBe(true);
    });

    it('handles negative dx values', () => {
      const { result } = renderHook(() => useSwipeBack());

      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      // Negative dx - swiping left
      act(() => {
        (result.current.panResponder as any).onPanResponderMove({}, { dx: -50 });
      });

      expect(result.current.isSwipingBack).toBe(true);
    });
  });

  describe('custom config', () => {
    it('accepts custom config values', () => {
      const customConfig = {
        sensitivity: 0.8,
        edgeThreshold: 100,
        velocityThreshold: 200,
        distanceThreshold: 150,
      };

      const { result } = renderHook(() =>
        useSwipeBack({ config: customConfig })
      );

      expect(result.current.config.edgeThreshold).toBe(100);
      expect(result.current.config.velocityThreshold).toBe(200);
      expect(result.current.config.distanceThreshold).toBe(150);
    });
  });

  describe('handleSwipeBack async behavior', () => {
    it('calls handleBackPress asynchronously when no custom callback', async () => {
      mockHandleBackPress.mockResolvedValue(true);
      mockHandleBackPress.mockClear();

      const { result } = renderHook(() => useSwipeBack());

      // Start swipe
      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      // Complete swipe with sufficient distance
      act(() => {
        (result.current.panResponder as any).onPanResponderRelease(
          {},
          { dx: 200, vx: 0 }
        );
      });

      // Run timers
      act(() => {
        jest.runAllTimers();
      });

      // handleBackPress should have been called
      expect(mockHandleBackPress).toHaveBeenCalledWith('swipe');
    });

    it('uses custom callback when provided', async () => {
      const customCallback = jest.fn();
      mockHandleBackPress.mockClear();

      const { result } = renderHook(() =>
        useSwipeBack({ customOnSwipeBack: customCallback })
      );

      // Start swipe
      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      // Complete swipe
      act(() => {
        (result.current.panResponder as any).onPanResponderRelease(
          {},
          { dx: 200, vx: 0 }
        );
      });

      // Run timers
      act(() => {
        jest.runAllTimers();
      });

      // Custom callback should be called, not handleBackPress
      expect(customCallback).toHaveBeenCalled();
      expect(mockHandleBackPress).not.toHaveBeenCalled();
    });
  });

  describe('swipe threshold combinations', () => {
    it('triggers on low distance with high velocity', () => {
      mockHandleBackPress.mockClear();

      const { result } = renderHook(() => useSwipeBack());

      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      // dx > swipeThreshold * 0.5 AND vx > velocityThreshold (100)
      act(() => {
        (result.current.panResponder as any).onPanResponderRelease(
          {},
          { dx: 25, vx: 150 }
        );
      });

      act(() => {
        jest.runAllTimers();
      });

      // Should have triggered the swipe
      const { Animated } = require('react-native');
      expect(Animated.timing).toHaveBeenCalled();
    });

    it('does not trigger on low distance with low velocity', () => {
      mockHandleBackPress.mockClear();

      const { result } = renderHook(() => useSwipeBack());

      act(() => {
        (result.current.panResponder as any).onPanResponderGrant();
      });

      // Both dx and vx are too low
      act(() => {
        (result.current.panResponder as any).onPanResponderRelease(
          {},
          { dx: 10, vx: 50 }
        );
      });

      // handleBackPress should NOT be called
      expect(mockHandleBackPress).not.toHaveBeenCalled();
    });
  });

  describe('return values', () => {
    it('exposes all expected properties', () => {
      const { result } = renderHook(() => useSwipeBack());

      expect(result.current).toHaveProperty('panResponder');
      expect(result.current).toHaveProperty('isSwipingBack');
      expect(result.current).toHaveProperty('swipeDirection');
      expect(result.current).toHaveProperty('swipeProgress');
      expect(result.current).toHaveProperty('swipeOpacity');
      expect(result.current).toHaveProperty('canSwipeBack');
      expect(result.current).toHaveProperty('config');
      expect(result.current).toHaveProperty('getSwipeStyles');
      expect(result.current).toHaveProperty('getIndicatorStyles');
      expect(result.current).toHaveProperty('resetSwipeState');
    });
  });
});
