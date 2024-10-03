import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import ExpandableText from '@/components/ExpandableText';

jest.mock('react-native/Libraries/LayoutAnimation/LayoutAnimation', () => ({
    configureNext: jest.fn(),
    create: jest.fn(),
    Types: {},
    Properties: {},
    Presets: {
      easeInEaseOut: jest.fn(),
    },
    checkConfig: jest.fn(),
  }));
  

describe('ExpandableText Component', () => {
  const longText = 'This is a very long text that should be truncated initially and expanded when clicked. It continues with more and more words to ensure it exceeds the initialLines limit.';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders text correctly', () => {
    const { getByText } = render(<ExpandableText text="Short text" />);
    expect(getByText('Short text')).toBeTruthy();
  });

  it('truncates long text by default', () => {
    const { getByText } = render(<ExpandableText text={longText} initialLines={2} />);
    const textComponent = getByText(longText);

    act(() => {
      fireEvent(textComponent, 'textLayout', {
        nativeEvent: {
          lines: Array(4).fill({}),
        },
      });
    });

    expect(textComponent.props.numberOfLines).toBe(2);
  });

  it('expands text when pressed', () => {
    const { getByText, getByTestId } = render(
      <ExpandableText text={longText} initialLines={2} />
    );
    const textComponent = getByText(longText);

    act(() => {
      fireEvent(textComponent, 'textLayout', {
        nativeEvent: {
          lines: Array(4).fill({}),
        },
      });
    });

    const touchableComponent = getByTestId('expandable-text');
    act(() => {
      fireEvent.press(touchableComponent);
    });

    expect(textComponent.props.numberOfLines).toBeUndefined();
  });

  it('collapses text when pressed again', () => {
    const { getByText, getByTestId } = render(
      <ExpandableText text={longText} initialLines={2} />
    );
    const textComponent = getByText(longText);

    act(() => {
      fireEvent(textComponent, 'textLayout', {
        nativeEvent: {
          lines: Array(4).fill({}),
        },
      });
    });

    const touchableComponent = getByTestId('expandable-text');

    act(() => {
      fireEvent.press(touchableComponent);
    });
    expect(textComponent.props.numberOfLines).toBeUndefined();

    act(() => {
      fireEvent.press(touchableComponent);
    });
    expect(textComponent.props.numberOfLines).toBe(2);
  });
});
