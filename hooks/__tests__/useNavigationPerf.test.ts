import { renderHook, act } from '@testing-library/react-native';

const mockLoggerInfo = jest.fn();
const mockLogger = jest.fn(() => ({ info: mockLoggerInfo }));

let mockPathname = '/initial';

jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('@/utils/logger', () => ({
  logger: () => mockLogger(),
}));

jest.mock('@/constants/env', () => ({
  isDebugEnabled: () => true,
}));

jest.mock('react-native', () => ({
  InteractionManager: {
    runAfterInteractions: (cb: () => void) => cb(),
  },
}));

import { useNavigationPerf } from '../useNavigationPerf';

describe('useNavigationPerf', () => {
  const originalRAF = globalThis.requestAnimationFrame;
  const originalPerformance = globalThis.performance;

  beforeEach(() => {
    mockLoggerInfo.mockClear();
    globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    };
    globalThis.performance = {
      now: jest.fn(() => Date.now()),
      mark: jest.fn(),
      measure: jest.fn(),
      clearMarks: jest.fn(),
      clearMeasures: jest.fn(),
      getEntriesByName: jest.fn(),
      getEntriesByType: jest.fn(),
      timeOrigin: 0,
    } as any;
  });

  afterEach(() => {
    globalThis.requestAnimationFrame = originalRAF;
    globalThis.performance = originalPerformance;
  });

  it('logs navigation performance metrics on route changes when debug enabled', () => {
    const { rerender } = renderHook(() => useNavigationPerf());

    act(() => {
      mockPathname = '/next';
      rerender({});
    });

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Navigation',
      'routeChangeStart',
      {
        from: '/initial',
        to: '/next',
      }
    );

    expect(mockLoggerInfo).toHaveBeenCalledWith(
      'Navigation',
      'routeChangeComplete',
      expect.objectContaining({ to: '/next' })
    );
  });
});
