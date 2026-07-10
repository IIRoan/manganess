import { renderHook } from '@testing-library/react-native';
import { useLibraryRefresh } from '../useLibraryRefresh';

const mockUseAtomValue = jest.fn();

jest.mock('@/atoms/libraryRefreshAtom', () => ({
  libraryRefreshAtom: 'libraryRefreshAtom',
}));

jest.mock('@zedux/react', () => ({
  useAtomValue: (...args: unknown[]) => mockUseAtomValue(...args),
}));

describe('useLibraryRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseAtomValue.mockReturnValue({ version: 0 });
  });

  it('does not run on initial mount', () => {
    const onRefresh = jest.fn();

    renderHook(() => useLibraryRefresh(onRefresh));

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('runs when the library refresh version changes', () => {
    const onRefresh = jest.fn();
    const { rerender } = renderHook(() => useLibraryRefresh(onRefresh));

    mockUseAtomValue.mockReturnValue({ version: 1 });
    rerender({});

    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('uses the latest refresh callback', () => {
    const firstRefresh = jest.fn();
    const secondRefresh = jest.fn();
    let callback = firstRefresh;
    const { rerender } = renderHook(() => useLibraryRefresh(callback));

    callback = secondRefresh;
    rerender(callback);
    mockUseAtomValue.mockReturnValue({ version: 1 });
    rerender(callback);

    expect(firstRefresh).not.toHaveBeenCalled();
    expect(secondRefresh).toHaveBeenCalledTimes(1);
  });
});
