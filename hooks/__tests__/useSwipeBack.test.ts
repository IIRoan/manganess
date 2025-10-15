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
      create: (config: any) => config,
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

    const shouldCapture = result.current.panResponder.onStartShouldSetPanResponder(
      startEvent
    );
    expect(shouldCapture).toBe(true);

    mockCanGoBack = false;
    const { result: resultCannotGoBack } = renderHook(() => useSwipeBack());
    const shouldCaptureWhenCannot =
      resultCannotGoBack.current.panResponder.onStartShouldSetPanResponder(
        startEvent
      );
    expect(shouldCaptureWhenCannot).toBe(false);
  });

  it('resets swipe state manually', () => {
    const { result } = renderHook(() => useSwipeBack());

    act(() => {
      result.current.panResponder.onPanResponderGrant();
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
});
