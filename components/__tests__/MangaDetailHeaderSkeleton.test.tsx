import { render } from '@testing-library/react-native';

import MangaDetailHeaderSkeleton, {
  MangaDetailMetaSkeleton,
} from '../MangaDetailHeaderSkeleton';

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    actualTheme: 'dark',
    theme: 'dark',
    systemTheme: 'dark',
    accentColor: undefined,
    setTheme: jest.fn(),
    toggleTheme: jest.fn(),
    setAccentColor: jest.fn(),
  }),
}));

describe('MangaDetailHeaderSkeleton', () => {
  it('renders a full-page loading placeholder', () => {
    const { getByLabelText } = render(<MangaDetailHeaderSkeleton />);
    expect(getByLabelText('Loading manga')).toBeTruthy();
  });

  it('renders the description and details placeholder', () => {
    const { getByLabelText } = render(<MangaDetailMetaSkeleton />);
    expect(getByLabelText('Loading manga details')).toBeTruthy();
  });
});
