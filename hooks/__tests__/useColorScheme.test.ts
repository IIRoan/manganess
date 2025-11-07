import { renderHook } from '@testing-library/react-native';

jest.mock('react-native', () => ({
  useColorScheme: jest.fn(() => 'dark'),
}));

import { useColorScheme } from '../useColorScheme';

describe('useColorScheme hook', () => {
  it('returns device color scheme', () => {
    const { result } = renderHook(() => useColorScheme());
    expect(result.current).toBe('dark');
  });
});

describe('useColorScheme web shim', () => {
  it('always returns light', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { useColorScheme: useWebScheme } = require('../useColorScheme.web');
    expect(useWebScheme()).toBe('light');
  });
});
