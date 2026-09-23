import { render } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

const mockUseToast = jest.fn();

jest.mock('@/hooks/useToast', () => ({
  useToast: () => mockUseToast(),
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    actualTheme: 'light',
    theme: 'light',
    accentColor: '#2E8B57',
  }),
}));

jest.mock('@/constants/Colors', () => ({
  Colors: {
    light: {
      card: '#FFFFFF',
      text: '#333333',
      border: '#E0E0E0',
    },
    dark: {
      card: '#121212',
      text: '#E0E0E0',
      border: '#333333',
    },
  },
}));

jest.mock('expo-router', () => ({
  usePathname: () => '/',
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

import { ToastHost } from '../ToastHost';

const metrics = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

describe('ToastHost', () => {
  it('renders nothing without a toast config', () => {
    mockUseToast.mockReturnValue({
      isVisible: false,
      config: null,
      showToast: jest.fn(),
    });

    const { queryByText, queryByLabelText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ToastHost />
      </SafeAreaProvider>
    );

    expect(queryByText(/./)).toBeNull();
    expect(queryByLabelText(/./)).toBeNull();
  });

  it('renders a single clean toast message', () => {
    mockUseToast.mockReturnValue({
      isVisible: true,
      config: {
        message: 'Having trouble reaching MangaFire…',
        type: 'warning',
        icon: 'cloud-offline-outline',
      },
      showToast: jest.fn(),
    });

    const { getByText, getByLabelText, queryAllByText } = render(
      <SafeAreaProvider initialMetrics={metrics}>
        <ToastHost />
      </SafeAreaProvider>
    );

    expect(getByText('Having trouble reaching MangaFire…')).toBeTruthy();
    expect(getByLabelText('Having trouble reaching MangaFire…')).toBeTruthy();
    expect(queryAllByText('Having trouble reaching MangaFire…')).toHaveLength(1);
  });
});
