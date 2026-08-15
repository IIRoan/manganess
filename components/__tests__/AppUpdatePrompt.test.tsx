import { render, fireEvent } from '@testing-library/react-native';
import { AppUpdatePrompt } from '../AppUpdatePrompt';

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }),
}));

describe('AppUpdatePrompt', () => {
  const handlers = {
    onInstall: jest.fn(),
    onRestart: jest.fn(),
    onLater: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows install and later when an update is available', () => {
    const { getByText, getByLabelText } = render(
      <AppUpdatePrompt
        visible
        phase="available"
        error={null}
        isDownloaded={false}
        {...handlers}
      />
    );

    expect(getByText('Update available')).toBeTruthy();
    fireEvent.press(getByLabelText('Install'));
    expect(handlers.onInstall).toHaveBeenCalled();
    fireEvent.press(getByLabelText('Later'));
    expect(handlers.onLater).toHaveBeenCalled();
  });

  it('hides dismiss while downloading', () => {
    const { queryByLabelText, getByText } = render(
      <AppUpdatePrompt
        visible
        phase="downloading"
        error={null}
        isDownloaded={false}
        {...handlers}
      />
    );

    expect(getByText('Downloading update')).toBeTruthy();
    expect(queryByLabelText('Later')).toBeNull();
    expect(queryByLabelText('Install')).toBeNull();
  });

  it('hides dismiss while restarting', () => {
    const { queryByLabelText, getByText } = render(
      <AppUpdatePrompt
        visible
        phase="restarting"
        error={null}
        isDownloaded
        {...handlers}
      />
    );

    expect(getByText('Restarting')).toBeTruthy();
    expect(queryByLabelText('Later')).toBeNull();
  });

  it('lets Later close an error', () => {
    const { getByLabelText, getByText } = render(
      <AppUpdatePrompt
        visible
        phase="error"
        error="Network failed"
        isDownloaded={false}
        {...handlers}
      />
    );

    expect(getByText('Update failed')).toBeTruthy();
    expect(getByText('Network failed')).toBeTruthy();
    fireEvent.press(getByLabelText('Later'));
    expect(handlers.onLater).toHaveBeenCalled();
  });
});
