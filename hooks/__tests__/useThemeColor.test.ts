import { renderHook } from '@testing-library/react-native';

jest.mock('react-native', () => ({
  useColorScheme: jest.fn(() => 'dark'),
}));

import { useThemeColor } from '../useThemeColor';

describe('useThemeColor', () => {
  it('returns explicit color from props when provided', () => {
    const { result } = renderHook(() =>
      useThemeColor({ dark: '#000', light: '#fff' }, 'background')
    );

    expect(result.current).toBe('#000');
  });

  it('falls back to predefined palette when prop missing', () => {
    const { result } = renderHook(() =>
      useThemeColor({}, 'background')
    );

    expect(typeof result.current).toBe('string');
  });
});
