import { renderHook, act } from '@testing-library/react-native';

const mockBack = jest.fn();
const mockReplace = jest.fn();

let mockCanGoBackValue = true;

jest.mock('expo-router', () => ({
  useRouter: () => ({
    canGoBack: () => mockCanGoBackValue,
    back: mockBack,
    replace: mockReplace,
  }),
}));

import { useNavigationHistory } from '../useNavigationHistory';

describe('useNavigationHistory', () => {
  beforeEach(() => {
    mockBack.mockClear();
    mockReplace.mockClear();
    mockCanGoBackValue = true;
  });

  it('handles back press when navigation stack can go back', () => {
    const { result } = renderHook(() => useNavigationHistory());

    act(() => {
      result.current.handleBackPress();
    });

    expect(mockBack).toHaveBeenCalled();
    expect(result.current.canGoBack).toBe(true);
    expect(result.current.currentDepth).toBe(1);
  });

  it('replaces route when cannot go back', () => {
    mockCanGoBackValue = false;
    const { result } = renderHook(() => useNavigationHistory());

    act(() => {
      result.current.handleBackPress();
    });

    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(result.current.canGoBack).toBe(false);
  });
});
