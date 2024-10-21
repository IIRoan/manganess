import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BottomPopup from '@/components/BottomPopup';
import { useTheme } from '@/constants/ThemeContext';

jest.mock('@/constants/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Icon',
}));

jest.mock('react-native-reanimated', () => {
  // Mock the Reanimated module to avoid errors during testing
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

describe('BottomPopup Component', () => {
  const onCloseMock = jest.fn();
  const optionPressMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      systemTheme: 'light',
    });
  });

  it('calls onClose when close button is pressed', () => {
    const { getByTestId } = render(
      <BottomPopup
        visible={true}
        title="Test Popup"
        onClose={onCloseMock}
        options={[]}
      />
    );

    fireEvent.press(getByTestId('close-button'));
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('calls option onPress and onClose when an option is pressed', () => {
    const { getByText } = render(
      <BottomPopup
        visible={true}
        title="Test Popup"
        onClose={onCloseMock}
        options={[
          { text: 'Option 1', onPress: optionPressMock },
        ]}
      />
    );

    fireEvent.press(getByText('Option 1'));
    expect(optionPressMock).toHaveBeenCalled();
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('does not render when not visible', () => {
    const { queryByText } = render(
      <BottomPopup
        visible={false}
        title="Hidden Popup"
        onClose={onCloseMock}
        options={[]}
      />
    );

    expect(queryByText('Hidden Popup')).toBeNull();
  });

  it('renders options with icons when provided', () => {
    const { getByText } = render(
      <BottomPopup
        visible={true}
        title="Icon Options"
        onClose={onCloseMock}
        options={[
          { text: 'Option with Icon', onPress: optionPressMock, icon: 'options' },
        ]}
      />
    );

    expect(getByText('Option with Icon')).toBeTruthy();
  });

  it('matches snapshot', () => {
    const tree = render(
      <BottomPopup
        visible={true}
        title="Snapshot Popup"
        onClose={onCloseMock}
        options={[
          { text: 'Snapshot Option', onPress: optionPressMock },
        ]}
      />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });
});
