import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import Alert from './Alert';

// Mock the dependencies
jest.mock('@/constants/ThemeContext', () => ({
  useTheme: () => ({ theme: 'light' }),
}));

// Mock only the useColorScheme hook
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => 'light',
}));

describe('Alert Component', () => {
  const mockOnClose = jest.fn();
  const mockOptionPress = jest.fn();

  const defaultProps = {
    visible: true,
    title: 'Test Alert',
    onClose: mockOnClose,
    type: 'bookmarks',
    options: [
      { text: 'Option 1', onPress: mockOptionPress, icon: 'book-outline' },
      { text: 'Option 2', onPress: mockOptionPress, icon: 'book' },
    ],
  };

  it('renders correctly with bookmarks type', () => {
    const { getByText } = render(<Alert {...defaultProps} />);
    expect(getByText('Test Alert')).toBeTruthy();
    expect(getByText('Option 1')).toBeTruthy();
    expect(getByText('Option 2')).toBeTruthy();
  });

  it('calls onClose when close button is pressed', () => {
    const { getByTestId } = render(<Alert {...defaultProps} />);
    fireEvent.press(getByTestId('close-button'));
    expect(mockOnClose).toHaveBeenCalled();
  });

  it('calls option onPress when an option is pressed', () => {
    const { getByText } = render(<Alert {...defaultProps} />);
    fireEvent.press(getByText('Option 1'));
    expect(mockOptionPress).toHaveBeenCalled();
  });

  it('renders correctly with confirm type', () => {
    const confirmProps = {
      ...defaultProps,
      type: 'confirm',
      message: 'Are you sure?',
      options: [
        { text: 'Cancel', onPress: mockOptionPress },
        { text: 'Confirm', onPress: mockOptionPress },
      ],
    };
    const { getByText } = render(<Alert {...confirmProps} />);
    expect(getByText('Are you sure?')).toBeTruthy();
    expect(getByText('Cancel')).toBeTruthy();
    expect(getByText('Confirm')).toBeTruthy();
  });

  it('does not render when visible is false', () => {
    const { queryByText } = render(<Alert {...defaultProps} visible={false} />);
    expect(queryByText('Test Alert')).toBeNull();
  });
});
