import { renderHook, act, waitFor } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';

import { useNetworkStatus } from '../useNetworkStatus';

jest.mock('@react-native-community/netinfo');

const mockNetInfo = NetInfo as jest.Mocked<typeof NetInfo>;

describe('useNetworkStatus', () => {
  let mockUnsubscribe: jest.Mock;
  let networkChangeListener: ((state: any) => void) | null = null;

  beforeEach(() => {
    jest.clearAllMocks();
    mockUnsubscribe = jest.fn();
    networkChangeListener = null;

    mockNetInfo.addEventListener.mockImplementation((listener) => {
      networkChangeListener = listener;
      return mockUnsubscribe;
    });

    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
      details: null,
    } as any);
  });

  it('returns initial default state', () => {
    const { result } = renderHook(() => useNetworkStatus());

    expect(result.current).toEqual({
      isConnected: true,
      isInternetReachable: null,
      type: 'unknown',
      isOffline: false,
    });
  });

  it('fetches initial network state on mount', async () => {
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
      details: null,
    } as any);

    const { result } = renderHook(() => useNetworkStatus());

    await waitFor(() => {
      expect(result.current.type).toBe('wifi');
    });

    expect(result.current).toEqual({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
      isOffline: false,
    });
  });

  it('subscribes to network state changes', () => {
    renderHook(() => useNetworkStatus());

    expect(mockNetInfo.addEventListener).toHaveBeenCalledTimes(1);
    expect(mockNetInfo.addEventListener).toHaveBeenCalledWith(
      expect.any(Function)
    );
  });

  it('unsubscribes on unmount', () => {
    const { unmount } = renderHook(() => useNetworkStatus());

    unmount();

    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
  });

  it('updates state when network changes to offline', async () => {
    const { result } = renderHook(() => useNetworkStatus());

    await waitFor(() => {
      expect(networkChangeListener).not.toBeNull();
    });

    act(() => {
      networkChangeListener?.({
        isConnected: false,
        isInternetReachable: false,
        type: 'none',
        details: null,
      });
    });

    expect(result.current).toEqual({
      isConnected: false,
      isInternetReachable: false,
      type: 'none',
      isOffline: true,
    });
  });

  it('updates state when network changes to online', async () => {
    mockNetInfo.fetch.mockResolvedValue({
      isConnected: false,
      isInternetReachable: false,
      type: 'none',
      details: null,
    } as any);

    const { result } = renderHook(() => useNetworkStatus());

    await waitFor(() => {
      expect(result.current.isOffline).toBe(true);
    });

    act(() => {
      networkChangeListener?.({
        isConnected: true,
        isInternetReachable: true,
        type: 'cellular',
        details: null,
      });
    });

    expect(result.current).toEqual({
      isConnected: true,
      isInternetReachable: true,
      type: 'cellular',
      isOffline: false,
    });
  });

  it('handles null isConnected value', async () => {
    const { result } = renderHook(() => useNetworkStatus());

    await waitFor(() => {
      expect(networkChangeListener).not.toBeNull();
    });

    act(() => {
      networkChangeListener?.({
        isConnected: null,
        isInternetReachable: null,
        type: 'unknown',
        details: null,
      });
    });

    expect(result.current.isConnected).toBe(false);
    expect(result.current.isOffline).toBe(true);
  });

  it('considers device offline when internet is not reachable', async () => {
    const { result } = renderHook(() => useNetworkStatus());

    await waitFor(() => {
      expect(networkChangeListener).not.toBeNull();
    });

    act(() => {
      networkChangeListener?.({
        isConnected: true,
        isInternetReachable: false,
        type: 'wifi',
        details: null,
      });
    });

    expect(result.current.isOffline).toBe(true);
  });

  it('handles different network types', async () => {
    const { result } = renderHook(() => useNetworkStatus());

    await waitFor(() => {
      expect(networkChangeListener).not.toBeNull();
    });

    const networkTypes = ['wifi', 'cellular', 'bluetooth', 'ethernet', 'vpn'];

    for (const type of networkTypes) {
      act(() => {
        networkChangeListener?.({
          isConnected: true,
          isInternetReachable: true,
          type,
          details: null,
        });
      });

      expect(result.current.type).toBe(type);
    }
  });
});
