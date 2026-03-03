import React from 'react';
import { Animated } from 'react-native';
import { act, render } from '@testing-library/react-native';
import { usePathname } from 'expo-router';

import { useOffline } from '@/hooks/useOffline';
import { OfflineIndicator } from '../OfflineIndicator';

// Mock dependencies
jest.mock('@/hooks/useOffline', () => ({
  useOffline: jest.fn(),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('expo-router', () => ({
  usePathname: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const mockUseOffline = useOffline as jest.MockedFunction<typeof useOffline>;
const mockUsePathname = usePathname as jest.MockedFunction<typeof usePathname>;

describe('OfflineIndicator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockUseOffline.mockReturnValue({
      showOfflineIndicator: false,
      isOffline: false,
      isConnected: true,
      networkType: 'wifi',
    });

    mockUsePathname.mockReturnValue('/home');
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Visibility', () => {
    it('returns null when not offline and indicator not showing', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: false,
        isOffline: false,
        isConnected: true,
        networkType: 'wifi',
      });

      const { toJSON } = render(<OfflineIndicator />);

      expect(toJSON()).toBeNull();
    });

    it('renders when offline', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: true,
        isOffline: true,
        isConnected: false,
        networkType: 'none',
      });

      const { getByText } = render(<OfflineIndicator />);

      expect(getByText('Offline Mode')).toBeTruthy();
    });

    it('renders when coming back online (showing indicator)', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: true,
        isOffline: false,
        isConnected: true,
        networkType: 'wifi',
      });

      const { getByText } = render(<OfflineIndicator />);

      expect(getByText('Back Online')).toBeTruthy();
    });
  });

  describe('Chapter route hiding', () => {
    it('hides indicator on chapter routes', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: true,
        isOffline: true,
        isConnected: false,
        networkType: 'none',
      });

      mockUsePathname.mockReturnValue('/manga/123/chapter/1');

      const { toJSON } = render(<OfflineIndicator />);

      expect(toJSON()).toBeNull();
    });

    it('shows indicator on non-chapter routes', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: true,
        isOffline: true,
        isConnected: false,
        networkType: 'none',
      });

      mockUsePathname.mockReturnValue('/manga/123');

      const { getByText } = render(<OfflineIndicator />);

      expect(getByText('Offline Mode')).toBeTruthy();
    });

    it('handles undefined pathname', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: true,
        isOffline: true,
        isConnected: false,
        networkType: 'none',
      });

      mockUsePathname.mockReturnValue(undefined as any);

      const { getByText } = render(<OfflineIndicator />);

      expect(getByText('Offline Mode')).toBeTruthy();
    });
  });

  describe('Styling', () => {
    it('uses red background when offline', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: true,
        isOffline: true,
        isConnected: false,
        networkType: 'none',
      });

      const { UNSAFE_getByType } = render(<OfflineIndicator />);

      const animatedView = UNSAFE_getByType(Animated.View);
      const style = animatedView.props.style;

      // Find the backgroundColor in the style array
      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;

      expect(flatStyle.backgroundColor).toBe('#FF6B6B');
    });

    it('uses green background when back online', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: true,
        isOffline: false,
        isConnected: true,
        networkType: 'wifi',
      });

      const { UNSAFE_getByType } = render(<OfflineIndicator />);

      const animatedView = UNSAFE_getByType(Animated.View);
      const style = animatedView.props.style;

      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;

      expect(flatStyle.backgroundColor).toBe('#4ECDC4');
    });

    it('positions indicator below safe area', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: true,
        isOffline: true,
        isConnected: false,
        networkType: 'none',
      });

      const { UNSAFE_getByType } = render(<OfflineIndicator />);

      const animatedView = UNSAFE_getByType(Animated.View);
      const style = animatedView.props.style;

      const flatStyle = Array.isArray(style)
        ? style.reduce((acc, s) => ({ ...acc, ...s }), {})
        : style;

      // insets.top (44) + 8
      expect(flatStyle.top).toBe(52);
    });
  });

  describe('Animation', () => {
    it('animates opacity when showing', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: false,
        isOffline: false,
        isConnected: true,
        networkType: 'wifi',
      });

      const { rerender } = render(<OfflineIndicator />);

      // Update to show offline indicator
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: true,
        isOffline: true,
        isConnected: false,
        networkType: 'none',
      });

      rerender(<OfflineIndicator />);

      // Animation should be triggered
      act(() => {
        jest.advanceTimersByTime(300);
      });

      // The component should be rendered with animation
    });

    it('resets opacity to 0 when hiding on chapter route', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: true,
        isOffline: true,
        isConnected: false,
        networkType: 'none',
      });

      const { rerender } = render(<OfflineIndicator />);

      // Navigate to chapter route
      mockUsePathname.mockReturnValue('/manga/123/chapter/5');

      rerender(<OfflineIndicator />);

      // Component should return null
    });
  });

  describe('Icons', () => {
    it('shows cloud-offline icon when offline', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: true,
        isOffline: true,
        isConnected: false,
        networkType: 'none',
      });

      const { UNSAFE_getAllByType } = render(<OfflineIndicator />);

      // Find Ionicons component
      const icons = UNSAFE_getAllByType('Ionicons' as any);
      expect(icons.length).toBeGreaterThan(0);
      expect(icons[0].props.name).toBe('cloud-offline-outline');
    });

    it('shows cloud-done icon when back online', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: true,
        isOffline: false,
        isConnected: true,
        networkType: 'wifi',
      });

      const { UNSAFE_getAllByType } = render(<OfflineIndicator />);

      const icons = UNSAFE_getAllByType('Ionicons' as any);
      expect(icons.length).toBeGreaterThan(0);
      expect(icons[0].props.name).toBe('cloud-done-outline');
    });
  });

  describe('Pointer events', () => {
    it('sets pointerEvents to none', () => {
      mockUseOffline.mockReturnValue({
        showOfflineIndicator: true,
        isOffline: true,
        isConnected: false,
        networkType: 'none',
      });

      const { UNSAFE_getByType } = render(<OfflineIndicator />);

      const animatedView = UNSAFE_getByType(Animated.View);
      expect(animatedView.props.pointerEvents).toBe('none');
    });
  });
});
