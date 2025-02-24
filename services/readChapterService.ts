import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMangaData, setMangaData } from './bookmarkService';

export const getReadChapters = async (mangaId: string): Promise<string[]> => {
    try {
        const mangaData = await getMangaData(mangaId);
        return mangaData?.readChapters || [];
    } catch (error) {
        console.error('Error getting read chapters:', error);
        return [];
    }
};

export const getLastReadChapter = async (mangaId: string): Promise<string | null> => {
    try {
        const mangaData = await getMangaData(mangaId);
        if (!mangaData?.lastReadChapter) {
            return 'Not started';
        }
        return `Chapter ${mangaData.lastReadChapter}`;
    } catch (error) {
        console.error('Error getting last read chapter:', error);
        return null;
    }
};

export const markChapterAsRead = async (
    mangaId: string,
    chapterNumber: string,
    currentReadChapters: string[]
): Promise<string[]> => {
    try {
        const mangaData = await getMangaData(mangaId);
        if (mangaData) {
            const updatedReadChapters = Array.from(
                new Set([...currentReadChapters, chapterNumber])
            );
            const highestChapter = Math.max(...updatedReadChapters.map(ch => parseFloat(ch))).toString();
            await setMangaData({
                ...mangaData,
                readChapters: updatedReadChapters,
                lastReadChapter: highestChapter,
                lastUpdated: Date.now()
            });
            return updatedReadChapters;
        }
        return currentReadChapters;
    } catch (error) {
        console.error('Error marking chapter as read:', error);
        return currentReadChapters;
    }
};

export const markChapterAsUnread = async (
    mangaId: string,
    chapterNumber: string,
    currentReadChapters: string[]
): Promise<string[]> => {
    try {
        const mangaData = await getMangaData(mangaId);
        if (mangaData) {
            const updatedReadChapters = currentReadChapters.filter(
                (chapter) => chapter !== chapterNumber
            );
            await setMangaData({
                ...mangaData,
                readChapters: updatedReadChapters,
                lastUpdated: Date.now()
            });
            return updatedReadChapters;
        }
        return currentReadChapters;
    } catch (error) {
        console.error('Error marking chapter as unread:', error);
        return currentReadChapters;
    }
};
