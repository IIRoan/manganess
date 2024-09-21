import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import MangaDetailScreen from './[id]';
import * as mangaFireService from '@/services/mangaFireService';
import * as bookmarkService from '@/services/bookmarkService';

// Mock the dependencies
jest.mock('expo-router', () => ({
    useLocalSearchParams: () => ({ id: '123' }),
    useRouter: () => ({ navigate: jest.fn() }),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
}));
jest.mock('@/constants/ThemeContext', () => ({
    useTheme: () => ({ theme: 'light' }),
}));
jest.mock('@/hooks/useNavigationHistory', () => ({
    useNavigationHistory: () => ({ handleBackPress: jest.fn() }),
}));

describe('MangaDetailScreen', () => {
    const mockMangaDetails = {
        id: '123',
        title: 'Test Manga',
        alternativeTitle: 'Alt Title',
        description: 'Test description',
        bannerImage: 'https://example.com/image.jpg',
        status: 'Ongoing',
        author: ['Author 1'],
        published: '2023',
        rating: '8.5',
        reviewCount: 100,
        genres: ['Action', 'Adventure'],
        chapters: [
            { number: '1', title: 'Chapter 1', date: '2023-01-01' },
            { number: '2', title: 'Chapter 2', date: '2023-01-02' },
        ],
    };

    beforeEach(() => {
        jest.spyOn(mangaFireService, 'fetchMangaDetails').mockResolvedValue(mockMangaDetails as any);
        jest.spyOn(bookmarkService, 'fetchBookmarkStatus').mockResolvedValue(null);
    });

    it('renders loading state initially', () => {
        const { getByTestId } = render(<MangaDetailScreen />);
        expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('renders manga details after loading', async () => {
        const { getByText, queryByTestId } = render(<MangaDetailScreen />);

        await waitFor(() => {
            expect(queryByTestId('loading-indicator')).toBeNull();
            expect(getByText('Test Manga')).toBeTruthy();
            expect(getByText('Alt Title')).toBeTruthy();
            expect(getByText('Ongoing')).toBeTruthy();
        });
    });

    it('handles chapter press', async () => {
        const { getAllByTestId } = render(<MangaDetailScreen />);

        await waitFor(() => {
            const chapterItems = getAllByTestId('chapter-item');
            fireEvent.press(chapterItems[0]);
        });

    });
});
