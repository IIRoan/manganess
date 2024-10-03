import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MangaCard from '../../components/MangaCard';
import { useTheme } from '@/constants/ThemeContext';

jest.mock('@/constants/ThemeContext', () => ({
    useTheme: jest.fn(),
}));

describe('MangaCard Component', () => {
    const onPressMock = jest.fn();

    beforeEach(() => {
        jest.clearAllMocks();
        (useTheme as jest.Mock).mockReturnValue({
            theme: 'light',
            systemTheme: 'light',
        });
    });

    it('renders correctly with all props', () => {
        const { getByText, getByLabelText } = render(
          <MangaCard
            title="Manga Title"
            imageUrl="http://example.com/image.jpg"
            onPress={onPressMock}
            lastReadChapter="Chapter 5"
          />
        );
      
        expect(getByText('Manga Title')).toBeTruthy();
        expect(getByText('Last read: Chapter 5')).toBeTruthy();
        expect(getByLabelText('Manga Image')).toBeTruthy();
      });
      


    it('calls onPress when pressed', () => {
        const { getByTestId } = render(
            <MangaCard
                title="Manga Title"
                imageUrl="http://example.com/image.jpg"
                onPress={onPressMock}
                lastReadChapter="Chapter 5"
            />
        );

        fireEvent.press(getByTestId('manga-card'));
        expect(onPressMock).toHaveBeenCalled();
    });


    it('renders correctly without lastReadChapter', () => {
        const { queryByText } = render(
            <MangaCard
                title="Manga Title"
                imageUrl="http://example.com/image.jpg"
                onPress={onPressMock}
                lastReadChapter={null}
            />
        );

        expect(queryByText(/Last read:/)).toBeNull();
    });

    it('matches snapshot', () => {
        const tree = render(
            <MangaCard
                title="Snapshot Manga"
                imageUrl="http://example.com/image.jpg"
                onPress={onPressMock}
                lastReadChapter="Chapter 10"
            />
        ).toJSON();

        expect(tree).toMatchSnapshot();
    });
});
