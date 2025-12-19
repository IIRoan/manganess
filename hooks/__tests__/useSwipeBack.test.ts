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
    Platform: { OS: 'ios' },
  };
});

import { useSwipeBack } from '../useSwipeBack';

describe('useSwipeBack', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockHandleBackPress.mockClear();
    mockCanGoBack = true;
    mockEnableGestures = true;
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
});
