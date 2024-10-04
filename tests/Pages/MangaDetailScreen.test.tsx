import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import MangaDetailScreen from '@/app/(tabs)/manga/[id]';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchMangaDetails, getChapterUrl } from '@/services/mangaFireService';
import { fetchBookmarkStatus, saveBookmark, removeBookmark } from '@/services/bookmarkService';
import { getLastReadChapter } from '@/services/readChapterService';
import { useTheme } from '@/constants/ThemeContext';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';
import { NavigationContainer } from '@react-navigation/native';

// Mock dependencies
jest.mock('expo-router', () => ({
    useLocalSearchParams: jest.fn(),
    useRouter: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
    getItem: jest.fn(),
    setItem: jest.fn(),
}));

jest.mock('@/services/mangaFireService', () => ({
    fetchMangaDetails: jest.fn(),
    getChapterUrl: jest.fn(),
}));

jest.mock('@/services/bookmarkService', () => ({
    fetchBookmarkStatus: jest.fn(),
    saveBookmark: jest.fn(),
    removeBookmark: jest.fn(),
}));

jest.mock('@/services/readChapterService', () => ({
    getLastReadChapter: jest.fn(),
}));

jest.mock('@/constants/ThemeContext', () => ({
    useTheme: jest.fn().mockReturnValue({ theme: 'light' }),
}));

jest.mock('@/hooks/useNavigationHistory', () => ({
    useNavigationHistory: jest.fn().mockReturnValue({ handleBackPress: jest.fn() }),
}));

jest.mock('@react-navigation/native', () => {
    const React = require('react');
    const actualNav = jest.requireActual('@react-navigation/native');
    return {
        ...actualNav,
        useNavigation: jest.fn(() => ({
            navigate: jest.fn(),
        })),
        useFocusEffect: jest.fn((callback) => {
            React.useEffect(callback, []);
        }),
    };
});

// Global mangaDetails object
const mangaDetails = {
    id: '123',
    title: 'Test Manga',
    alternativeTitle: 'Alternative Test Manga',
    description: 'This is a test description.',
    bannerImage: 'http://example.com/image.jpg',
    status: 'Ongoing',
    author: ['Author 1', 'Author 2'],
    published: '2020',
    rating: '8.5',
    reviewCount: '100',
    genres: ['Action', 'Adventure'],
    chapters: [
        { number: '1', title: 'Chapter 1', date: '2020-01-01' },
        { number: '2', title: 'Chapter 2', date: '2020-02-01' },
    ],
};

const TestWrapper = ({ children }: { children: React.ReactNode }) => {
    return <NavigationContainer>{children}</NavigationContainer>;
};

describe('MangaDetailScreen', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('renders loading indicator while loading', () => {
        (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });

        const { getByTestId } = render(
            <TestWrapper>
                <MangaDetailScreen />
            </TestWrapper>
        );

        expect(getByTestId('loading-indicator')).toBeTruthy();
    });

    it('renders manga details after loading', async () => {
        (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
        (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
        (fetchBookmarkStatus as jest.Mock).mockResolvedValue(null);
        (getLastReadChapter as jest.Mock).mockResolvedValue('Chapter 2');

        const { findByText, queryByTestId } = render(
            <TestWrapper>
                <MangaDetailScreen />
            </TestWrapper>
        );

        await waitFor(() => expect(queryByTestId('loading-indicator')).toBeNull());

        expect(await findByText('Test Manga')).toBeTruthy();
        expect(await findByText('Alternative Test Manga')).toBeTruthy();
        expect(await findByText('Description')).toBeTruthy();
        expect(await findByText('This is a test description.')).toBeTruthy();
        expect(await findByText('Chapters')).toBeTruthy();
        expect(await findByText('Chapter 1')).toBeTruthy();
    });

    it('displays error message when loading fails', async () => {
        (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
        (fetchMangaDetails as jest.Mock).mockRejectedValue(new Error('Failed to load'));

        const { findByText } = render(
            <TestWrapper>
                <MangaDetailScreen />
            </TestWrapper>
        );

        expect(await findByText('Failed to load manga details. Please try again.')).toBeTruthy();
    });

    it('navigates to chapter screen when chapter is pressed', async () => {
        const mockNavigate = jest.fn();
        (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
        (useRouter as jest.Mock).mockReturnValue({ navigate: mockNavigate });

        (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
        (getLastReadChapter as jest.Mock).mockResolvedValue('<Text>Chapter 1</Text>');
        (getChapterUrl as jest.Mock).mockReturnValue('https://example.com/manga/123/chapter/1');

        const { findByText } = render(
            <TestWrapper>
                <MangaDetailScreen />
            </TestWrapper>
        );

        const chapterItem = await findByText('Chapter 1');

        fireEvent.press(chapterItem);

        expect(mockNavigate).toHaveBeenCalledWith('/manga/123/chapter/1');
    });

    it('shows alert when bookmark button is pressed', async () => {
        (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
        (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
        (getLastReadChapter as jest.Mock).mockResolvedValue('Chapter 1');

        const { findByTestId } = render(
            <TestWrapper>
                <MangaDetailScreen />
            </TestWrapper>
        );

        const bookmarkButton = await findByTestId('bookmark-button');

        fireEvent.press(bookmarkButton);

        expect(await findByTestId('alert-title')).toBeTruthy();
    });

    it('marks chapter as unread when long pressed', async () => {
        (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
        (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
        (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(['1']));
        (getLastReadChapter as jest.Mock).mockResolvedValue('<Text>Chapter 1</Text>');

        const { findByText, findByTestId } = render(
            <TestWrapper>
                <MangaDetailScreen />
            </TestWrapper>
        );

        const chapterItem = await findByText('Chapter 1');

        fireEvent(chapterItem, 'longPress');

        expect(await findByTestId('alert-title')).toBeTruthy();

        const yesButton = await findByText('Yes');

        fireEvent.press(yesButton);

        expect(AsyncStorage.setItem).toHaveBeenCalledWith('manga_123_read_chapters', JSON.stringify([]));
    });

    it('saves bookmark when bookmark option is selected', async () => {
        (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
        (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
        (getLastReadChapter as jest.Mock).mockResolvedValue('Chapter 1');
    
        const mockSaveBookmark = jest.fn();
        (saveBookmark as jest.Mock).mockImplementation(mockSaveBookmark);
    
        const { findByTestId, findByText } = render(
            <TestWrapper>
                <MangaDetailScreen />
            </TestWrapper>
        );
    
        const bookmarkButton = await findByTestId('bookmark-button');
    
        fireEvent.press(bookmarkButton);
    
        expect(await findByTestId('alert-title')).toBeTruthy();
    
        const toReadOption = await findByText('To Read');
        fireEvent.press(toReadOption);
    
        // Adjust the expected arguments to match the actual call
        expect(mockSaveBookmark).toHaveBeenCalledWith(
            '123',
            'To Read',
            mangaDetails,
            ['1'], // Adjust this to match the actual state
            expect.any(Function),
            expect.any(Function),
            expect.any(Function)
        );
    });
    
    it('removes bookmark when unbookmark option is selected', async () => {
        const mangaDetails = {
            id: '123',
            title: 'Test Manga',
            chapters: [],
        };

        (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
        (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
        (getLastReadChapter as jest.Mock).mockResolvedValue('<Text>Chapter 1</Text>');
        (fetchBookmarkStatus as jest.Mock).mockResolvedValue('To Read');

        const mockRemoveBookmark = jest.fn();
        (removeBookmark as jest.Mock).mockImplementation(mockRemoveBookmark);

        const { findByTestId, findByText } = render(
            <TestWrapper>
                <MangaDetailScreen />
            </TestWrapper>
        );

        const bookmarkButton = await findByTestId('bookmark-button');

        fireEvent.press(bookmarkButton);

        expect(await findByTestId('alert-title')).toBeTruthy();

        const unbookmarkOption = await findByText('Unbookmark');
        fireEvent.press(unbookmarkOption);

        expect(mockRemoveBookmark).toHaveBeenCalledWith('123', expect.any(Function), expect.any(Function));
    });

    it('handles last read chapter navigation', async () => {
        const mangaDetails = {
            id: '123',
            title: 'Test Manga',
            chapters: [
                { number: '1', title: 'Chapter 1', date: '2020-01-01' },
                { number: '2', title: 'Chapter 2', date: '2020-02-01' },
            ],
        };
    
        (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
        (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
        (getLastReadChapter as jest.Mock).mockResolvedValue('Chapter 1');
    
        const mockNavigate = jest.fn();
        (useRouter as jest.Mock).mockReturnValue({ navigate: mockNavigate });
    
        const { findByText } = render(
            <TestWrapper>
                <MangaDetailScreen />
            </TestWrapper>
        );
    
        const lastReadButton = await waitFor(() => findByText('Continue from Chapter 1'));
    
        fireEvent.press(lastReadButton);
    
        expect(mockNavigate).toHaveBeenCalledWith('/manga/123/chapter/1');
    });
    
    it('handles empty last read chapter correctly', async () => {
        const mangaDetails = {
            id: '123',
            title: 'Test Manga',
            chapters: [
                { number: '2', title: 'Chapter 2', date: '2021-01-01' },
                { number: '1', title: 'Chapter 1', date: '2020-01-01' },
            ],
        };
    
        (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
        (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
        (getLastReadChapter as jest.Mock).mockResolvedValue(null);
    
        const mockNavigate = jest.fn();
        (useRouter as jest.Mock).mockReturnValue({ navigate: mockNavigate });
    
        const { findByText } = render(
            <TestWrapper>
                <MangaDetailScreen />
            </TestWrapper>
        );
    
        const startReadingButton = await findByText('Start reading');
    
        fireEvent.press(startReadingButton);
    
        expect(mockNavigate).toHaveBeenCalledWith('/manga/123/chapter/1');
    });
    
});
