import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import Alert from '../components/Alert';
import { useTheme } from '@/constants/ThemeContext';

jest.mock('@/constants/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Icon',
}));

describe('Alert Component', () => {
  const onCloseMock = jest.fn();
  const optionPressMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    (useTheme as jest.Mock).mockReturnValue({
      theme: 'light',
      systemTheme: 'light',
    });
  });

  it('renders correctly when visible', async () => {
    await act(async () => {
      const { getByTestId } = render(
        <Alert
          visible={true}
          title="Test Alert"
          onClose={onCloseMock}
          type="bookmarks"
          options={[
            { text: 'Option 1', onPress: optionPressMock },
            { text: 'Option 2', onPress: optionPressMock },
          ]}
        />
  
      );
  
      expect(getByTestId('alert-title').props.children).toBe('Test Alert');
      expect(getByTestId('alert-options')).toBeTruthy();
    });
  });
  


  it('calls onClose when close button is pressed', () => {
    const { getByTestId } = render(
      <Alert
        visible={true}
        title="Test Alert"
        onClose={onCloseMock}
        type="bookmarks"
        options={[]}
      />
    );

    fireEvent.press(getByTestId('close-button'));
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('calls option onPress and onClose when an option is pressed', () => {
    const { getAllByText } = render(
      <Alert
        visible={true}
        title="Test Alert"
        onClose={onCloseMock}
        type="bookmarks"
        options={[
          { text: 'Option 1', onPress: optionPressMock },
        ]}
      />
    );

    fireEvent.press(getAllByText('Option 1')[0]);
    expect(optionPressMock).toHaveBeenCalled();
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('does not render when not visible', () => {
    const { queryByTestId } = render(
      <Alert
        visible={false}
        title="Hidden Alert"
        onClose={onCloseMock}
        type="bookmarks"
        options={[]}
      />
    );

    expect(queryByTestId('alert-title')).toBeNull();
  });

  it('renders confirm type with message and buttons', () => {
    const { getByText } = render(
      <Alert
        visible={true}
        title="Confirm Action"
        onClose={onCloseMock}
        type="confirm"
        message="Are you sure?"
        options={[
          { text: 'Yes', onPress: optionPressMock },
          { text: 'No', onPress: optionPressMock },
        ]}
      />
    );

    expect(getByText('Are you sure?')).toBeTruthy();
    expect(getByText('Yes')).toBeTruthy();
    expect(getByText('No')).toBeTruthy();
  });

  it('calls onPress and onClose when confirm button is pressed', () => {
    const { getByText } = render(
      <Alert
        visible={true}
        title="Confirm"
        onClose={onCloseMock}
        type="confirm"
        message="Proceed?"
        options={[
          { text: 'Proceed', onPress: optionPressMock },
        ]}
      />
    );

    fireEvent.press(getByText('Proceed'));
    expect(optionPressMock).toHaveBeenCalled();
    expect(onCloseMock).toHaveBeenCalled();
  });

  it('matches snapshot', () => {
    const tree = render(
      <Alert
        visible={true}
        title="Snapshot Alert"
        onClose={onCloseMock}
        type="bookmarks"
        options={[
          { text: 'Snapshot Option', onPress: optionPressMock },
        ]}
      />
    ).toJSON();

    expect(tree).toMatchSnapshot();
  });
});
