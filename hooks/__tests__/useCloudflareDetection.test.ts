import { renderHook, act } from '@testing-library/react-native';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace }),
}));

import { useCloudflareDetection } from '../useCloudflareDetection';

describe('useCloudflareDetection', () => {
  beforeEach(() => {
    mockPush.mockClear();
    mockReplace.mockClear();
  });

  it('detects cloudflare challenge and navigates to verification page', () => {
    const { result } = renderHook(() => useCloudflareDetection());

    act(() => {
      const detected = result.current.checkForCloudflare(
        '<html>cf-browser-verification</html>',
        '/current'
      );
      expect(detected).toBe(true);
    });

    expect(result.current.isCloudflareDetected).toBe(true);
    expect(mockPush).toHaveBeenCalledWith('/cloudflare');

    act(() => {
      result.current.handleVerificationComplete();
    });

    expect(result.current.isCloudflareDetected).toBe(false);
    expect(mockReplace).toHaveBeenCalledWith('/current');
  });

  it('resets detection state', () => {
    const { result } = renderHook(() => useCloudflareDetection());

    act(() => {
      result.current.checkForCloudflare('no challenge');
      result.current.resetCloudflareDetection();
    });

    expect(result.current.isCloudflareDetected).toBe(false);
  });
});
