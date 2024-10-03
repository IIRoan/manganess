import React from 'react';
import { render } from '@testing-library/react-native';
import { GenreTag } from '@/components/GanreTag';
import { useTheme } from '@/constants/ThemeContext';

jest.mock('@/constants/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

describe('GenreTag Component', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useTheme).mockReturnValue({
      theme: 'light',
      systemTheme: 'light',
      setTheme: jest.fn(),
      toggleTheme: jest.fn(),
      actualTheme: 'light',
    });
  });

  it('renders the genre text', () => {
    const { getByText } = render(<GenreTag genre="Action" />);
    expect(getByText('Action')).toBeTruthy();
  });

  it('matches snapshot', () => {
    const tree = render(<GenreTag genre="Drama" />).toJSON();
    expect(tree).toMatchSnapshot();
  });
});
