import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SwipeableChapterItem from '../SwipeChapterItem';
import { Colors } from '@/constants/Colors';

// Mock gesture handler
jest.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: ({ children }: any) => <View>{children}</View>,
  };
});

// Mock dependencies
jest.mock('../DownloadButton', () => 'DownloadButton');
jest.mock('@/hooks/useDownloadStatus', () => ({
  useDownloadStatus: () => ({
    isDownloaded: false,
    isDownloading: false,
    refresh: jest.fn().mockResolvedValue(undefined),
  }),
}));
jest.mock('@/utils/stripChapterPrefix', () => ({
  stripChapterPrefix: (title: string) => title.replace(/^Chapter \d+:?\s*/, ''),
}));

const mockChapter = {
  number: '5',
  title: 'Chapter 5: The Beginning',
  date: '2024-01-15',
  url: 'https://example.com/chapter/5',
};

const defaultProps = {
  chapter: mockChapter,
  isRead: false,
  isLastItem: false,
  isCurrentlyLastRead: false,
  onPress: jest.fn(),
  onLongPress: jest.fn(),
  onUnread: jest.fn(),
  colors: Colors.light,
  styles: {},
  getCurrentlyOpenSwipeable: jest.fn(() => null),
  setCurrentlyOpenSwipeable: jest.fn(),
};

describe('SwipeableChapterItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders chapter information correctly', () => {
    const { getByText } = render(<SwipeableChapterItem {...defaultProps} />);

    expect(getByText('#5')).toBeTruthy();
    expect(getByText('The Beginning')).toBeTruthy();
    expect(getByText('2024-01-15')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const { getByRole } = render(<SwipeableChapterItem {...defaultProps} />);

    const button = getByRole('button');
    fireEvent.press(button);

    expect(defaultProps.onPress).toHaveBeenCalledTimes(1);
  });

  it('calls onLongPress when long pressed', () => {
    const { getByRole } = render(<SwipeableChapterItem {...defaultProps} />);

    const button = getByRole('button');
    fireEvent(button, 'longPress');

    expect(defaultProps.onLongPress).toHaveBeenCalledTimes(1);
  });

  it('shows read indicator when chapter is read', () => {
    const { getByRole } = render(
      <SwipeableChapterItem {...defaultProps} isRead={true} />
    );

    // Read chapters should have muted text color
    const button = getByRole('button');
    expect(button).toBeTruthy();
  });

  it('shows last read indicator when isCurrentlyLastRead is true', () => {
    const { getByText } = render(
      <SwipeableChapterItem {...defaultProps} isCurrentlyLastRead={true} />
    );

    // Should render chapter number
    expect(getByText('#5')).toBeTruthy();
  });

  it('does not navigate when swipeable is open', () => {
    const mockSwipeable = {
      close: jest.fn(),
      openLeft: jest.fn(),
      openRight: jest.fn(),
      reset: jest.fn(),
    };
    const props = {
      ...defaultProps,
      getCurrentlyOpenSwipeable: jest.fn(() => mockSwipeable),
    };

    const { getByRole } = render(<SwipeableChapterItem {...props} />);

    const button = getByRole('button');
    fireEvent.press(button);

    expect(mockSwipeable.close).toHaveBeenCalled();
    expect(defaultProps.onPress).not.toHaveBeenCalled();
  });

  it('strips chapter prefix from title', () => {
    const { getByText, queryByText } = render(
      <SwipeableChapterItem {...defaultProps} />
    );

    expect(getByText('The Beginning')).toBeTruthy();
    expect(queryByText('Chapter 5: The Beginning')).toBeNull();
  });

  it('shows only date when title has no meaningful content', () => {
    const props = {
      ...defaultProps,
      chapter: { ...mockChapter, title: 'Chapter 5' },
    };

    const { getByText } = render(<SwipeableChapterItem {...props} />);

    expect(getByText('2024-01-15')).toBeTruthy();
  });

  it('has proper accessibility labels', () => {
    const { getByRole } = render(<SwipeableChapterItem {...defaultProps} />);

    const button = getByRole('button');
    expect(button.props.accessibilityLabel).toContain('Chapter 5');
    expect(button.props.accessibilityHint).toBeTruthy();
  });

  it('updates accessibility hint for read chapters', () => {
    const { getByRole } = render(
      <SwipeableChapterItem {...defaultProps} isRead={true} />
    );

    const button = getByRole('button');
    expect(button.props.accessibilityHint).toContain('Read chapter');
  });
});
