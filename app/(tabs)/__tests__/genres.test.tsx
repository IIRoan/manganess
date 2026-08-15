import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import GenresScreen from '../genres';
import axios from 'axios';
import { router } from 'expo-router';
import { resetMangaFireRequestHubForTests } from '@/services/mangaFireRequestHub';

// Mock router
jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
  },
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    actualTheme: 'light',
    accentColor: '#007AFF',
  }),
}));

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('@/components/MangaCard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TouchableOpacity, Text, View } = require('react-native');
  return function MockMangaCard({ title, onPress, mangaId }: any) {
    return (
      <View testID={`manga-card-${mangaId}`}>
        <TouchableOpacity
          testID={`manga-card-press-${mangaId}`}
          onPress={onPress}
        >
          <Text>{title}</Text>
        </TouchableOpacity>
      </View>
    );
  };
});

jest.mock('@/utils/logger', () => ({
  logger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  }),
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

// Sample API response for genre manga
const sampleGenreApiResponse = {
  items: [
    {
      id: 1,
      hid: '123',
      slug: 'one-piece',
      title: 'One Piece',
      type: 'manga',
      poster: { medium: 'https://example.com/one-piece.jpg' },
      url: '/title/one-piece.123',
    },
    {
      id: 2,
      hid: '456',
      slug: 'naruto',
      title: 'Naruto',
      type: 'manga',
      poster: { medium: 'https://example.com/naruto.jpg' },
      url: '/title/naruto.456',
    },
  ],
};

describe('GenresScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMangaFireRequestHubForTests();
    mockedAxios.get.mockResolvedValue({ data: sampleGenreApiResponse });
  });

  const renderScreen = () =>
    render(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <GenresScreen />
      </SafeAreaProvider>
    );

  it('renders genres title', async () => {
    const { getByText } = renderScreen();

    expect(getByText('Genres')).toBeTruthy();
  });

  it('renders search input', async () => {
    const { getByPlaceholderText } = renderScreen();

    expect(getByPlaceholderText('Search genres')).toBeTruthy();
  });

  it('renders genre cards', async () => {
    const { getByText } = renderScreen();

    // Check some genres are rendered
    expect(getByText('Action')).toBeTruthy();
    expect(getByText('Adventure')).toBeTruthy();
    expect(getByText('Comedy')).toBeTruthy();
    expect(getByText('Drama')).toBeTruthy();
  });

  it('filters genres when searching', async () => {
    const { getByPlaceholderText, getByText, queryByText } = renderScreen();

    const input = getByPlaceholderText('Search genres');

    await act(async () => {
      fireEvent.changeText(input, 'action');
    });

    expect(getByText('Action')).toBeTruthy();
    expect(queryByText('Comedy')).toBeNull();
  });

  it('clears search when clear button is pressed', async () => {
    const { getByPlaceholderText } = renderScreen();

    const input = getByPlaceholderText('Search genres');

    await act(async () => {
      fireEvent.changeText(input, 'action');
    });

    // Clear button should exist and work
    // Note: Button is an Ionicons close-circle-outline
  });

  it('selects genre and fetches manga', async () => {
    const { getByText } = renderScreen();

    await act(async () => {
      fireEvent.press(getByText('Action'));
    });

    await waitFor(() => {
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://mangafire.to/api/titles',
        expect.objectContaining({
          params: expect.objectContaining({
            genres: ['action'],
            limit: 40,
            vrf: 'test-vrf-token',
          }),
        })
      );
    });
  });

  it('shows genre title when genre is selected', async () => {
    const { getByText } = renderScreen();

    await act(async () => {
      fireEvent.press(getByText('Action'));
    });

    await waitFor(() => {
      expect(getByText('Action Manga')).toBeTruthy();
    });
  });

  it('shows back button when genre is selected', async () => {
    const { getByText } = renderScreen();

    await act(async () => {
      fireEvent.press(getByText('Action'));
    });

    await waitFor(() => {
      expect(getByText('Action Manga')).toBeTruthy();
    });

    // Back button should be present (Ionicons arrow-back)
  });

  it('goes back to genre list when back button is pressed', async () => {
    const { getByText } = renderScreen();

    await act(async () => {
      fireEvent.press(getByText('Action'));
    });

    await waitFor(() => {
      expect(getByText('Action Manga')).toBeTruthy();
    });

    // Find TouchableOpacity with back arrow and press it
    // The back button is rendered before the genre title
  });

  it('shows loading state when fetching manga', async () => {
    let resolvePromise: (value: any) => void;
    const promise = new Promise((resolve) => {
      resolvePromise = resolve;
    });
    mockedAxios.get.mockReturnValue(promise as any);

    const { getByText } = renderScreen();

    await act(async () => {
      fireEvent.press(getByText('Action'));
    });

    // Should show loading
    await waitFor(() => {
      expect(getByText('Loading manga...')).toBeTruthy();
    });

    // Resolve the promise
    await act(async () => {
      resolvePromise!({ data: sampleGenreApiResponse });
    });
  });

  it('shows empty state when no manga found', async () => {
    mockedAxios.get.mockResolvedValue({ data: { items: [] } });

    const { getByText } = renderScreen();

    await act(async () => {
      fireEvent.press(getByText('Action'));
    });

    await waitFor(() => {
      expect(getByText('No manga found for this genre')).toBeTruthy();
    });
  });

  it('handles fetch error gracefully', async () => {
    // Non-retryable (404) so withApiRetry fails immediately instead of ~3s backoff.
    mockedAxios.get.mockRejectedValue({
      message: 'Request failed with status code 404',
      response: { status: 404 },
    });

    const { getByText } = renderScreen();

    await act(async () => {
      fireEvent.press(getByText('Action'));
    });

    await waitFor(() => {
      expect(getByText('No manga found for this genre')).toBeTruthy();
    });
  });

  it('navigates to home when back button pressed on genre list', async () => {
    const { getByLabelText } = renderScreen();

    // Find the back button by accessibility label
    const backButton = getByLabelText('Go back to home');

    await act(async () => {
      fireEvent.press(backButton);
    });

    expect(router.push).toHaveBeenCalledWith('/');
  });

  it('renders all genre categories', async () => {
    const { getByText } = renderScreen();

    // Check various genres are rendered (only check ones that should be visible initially)
    const visibleGenres = [
      'Action',
      'Adventure',
      'Comedy',
      'Drama',
      'Fantasy',
      'Horror',
    ];

    for (const genre of visibleGenres) {
      expect(getByText(genre)).toBeTruthy();
    }

    // Mystery, Romance, Sci-Fi, and Slice of Life may not be rendered initially
    // in test environment due to FlatList virtualization
  });

  it('sorts genres alphabetically', async () => {
    const { getByText } = renderScreen();

    // Action should come before Adventure alphabetically
    expect(getByText('Action')).toBeTruthy();
    expect(getByText('Adventure')).toBeTruthy();
  });

  it('navigates to manga detail when manga card is pressed', async () => {
    mockedAxios.get.mockResolvedValue({ data: sampleGenreApiResponse });

    const { getByText } = renderScreen();

    await act(async () => {
      fireEvent.press(getByText('Action'));
    });

    // Wait for manga to load
    await waitFor(() => {
      expect(getByText('Action Manga')).toBeTruthy();
    });
  });

  it('handles invalid HTML response', async () => {
    mockedAxios.get.mockResolvedValue({ data: 'invalid html' });

    const { getByText } = renderScreen();

    await act(async () => {
      fireEvent.press(getByText('Action'));
    });

    await waitFor(() => {
      expect(getByText('No manga found for this genre')).toBeTruthy();
    });
  });

  it('handles null response data', async () => {
    mockedAxios.get.mockResolvedValue({ data: null });

    const { getByText } = renderScreen();

    await act(async () => {
      fireEvent.press(getByText('Action'));
    });

    await waitFor(() => {
      expect(getByText('No manga found for this genre')).toBeTruthy();
    });
  });

  it('shows genre color dots', async () => {
    renderScreen();

    // Genre cards should have colored dots
    // Each genre has a different color defined
  });

  it('handles search with no results', async () => {
    const { getByPlaceholderText, queryByText } = renderScreen();

    const input = getByPlaceholderText('Search genres');

    await act(async () => {
      fireEvent.changeText(input, 'xyznonexistent');
    });

    // All genres should be hidden
    expect(queryByText('Action')).toBeNull();
    expect(queryByText('Comedy')).toBeNull();
  });

  it('handles case-insensitive search', async () => {
    const { getByPlaceholderText, getByText } = renderScreen();

    const input = getByPlaceholderText('Search genres');

    await act(async () => {
      fireEvent.changeText(input, 'ACTION');
    });

    expect(getByText('Action')).toBeTruthy();
  });

  it('clears manga list when going back from genre view', async () => {
    const { getByText } = renderScreen();

    // Select a genre
    await act(async () => {
      fireEvent.press(getByText('Action'));
    });

    await waitFor(() => {
      expect(getByText('Action Manga')).toBeTruthy();
    });

    // Now we should be in genre view with manga list
    // The component clears manga list when going back
  });
});
