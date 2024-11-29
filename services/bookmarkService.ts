import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'html-entities';
import { Alert } from 'react-native';
import { updateAniListStatus } from './anilistService';

export type BookmarkStatus = "To Read" | "Reading" | "Read";

export const fetchBookmarkStatus = async (id: string): Promise<string | null> => {
    return await AsyncStorage.getItem(`bookmark_${id}`);
};

const markAllChaptersAsRead = async (
    id: string,
    mangaDetails: any,
    setReadChapters: (chapters: string[]) => void
) => {
    try {
        if (mangaDetails && mangaDetails.chapters && mangaDetails.chapters.length > 0) {
            const key = `manga_${id}_read_chapters`;
            const allChapterNumbers = mangaDetails.chapters.map(
                (chapter: any) => chapter.number
            );
            await AsyncStorage.setItem(key, JSON.stringify(allChapterNumbers));
            setReadChapters(allChapterNumbers);
        } else {
            console.log('No chapters to mark as read');
        }
    } catch (error) {
        console.error('Error marking all chapters as read:', error);
    }
};

export const saveBookmark = async (
    id: string,
    status: BookmarkStatus,
    mangaDetails: any,
    readChapters: string[],
    setBookmarkStatus: (status: string | null) => void,
    setIsAlertVisible: (visible: boolean) => void,
    setReadChapters: (chapters: string[]) => void
) => {
    try {
        await AsyncStorage.setItem(`bookmark_${id}`, status);

        const decodedTitle = decode(mangaDetails?.title || '');
        await AsyncStorage.setItem(`title_${id}`, decodedTitle);
        await AsyncStorage.setItem(`image_${id}`, mangaDetails?.bannerImage || '');

        const keys = await AsyncStorage.getItem('bookmarkKeys');
        const bookmarkKeys = keys ? JSON.parse(keys) : [];
        if (!bookmarkKeys.includes(`bookmark_${id}`)) {
            bookmarkKeys.push(`bookmark_${id}`);
            await AsyncStorage.setItem('bookmarkKeys', JSON.stringify(bookmarkKeys));
        }

        setBookmarkStatus(status);
        setIsAlertVisible(false);

        if (status === "Reading" && mangaDetails && mangaDetails.chapters && mangaDetails.chapters.length > 0) {
            const lastReleasedChapter = mangaDetails.chapters[0].number;
            await AsyncStorage.setItem(`last_notified_chapter_${id}`, lastReleasedChapter);
            console.log(`Set last notified chapter for ${id} to ${lastReleasedChapter}`);
        }

        if (status === "Read") {
            Alert.alert(
                "Mark All Chapters as Read",
                "Do you want to mark all chapters as read?",
                [
                    {
                        text: "No",
                        style: "cancel",
                        onPress: () => updateAniListStatus(mangaDetails?.title, status, readChapters, mangaDetails?.chapters.length)
                    },
                    {
                        text: "Yes",
                        onPress: async () => {
                            await markAllChaptersAsRead(id, mangaDetails, setReadChapters);
                            await updateAniListStatus(mangaDetails?.title, status, readChapters, mangaDetails?.chapters.length);
                        }
                    }
                ]
            );
        } else {
            await updateAniListStatus(mangaDetails?.title, status, readChapters, mangaDetails?.chapters.length);
        }

        // Set the bookmark changed flag
        await AsyncStorage.setItem('bookmarkChanged', 'true');
    } catch (error) {
        console.error('Error saving bookmark:', error);
        Alert.alert("Error", "Failed to update status. Please try again.");
    }
};

export const removeBookmark = async (
    id: string,
    setBookmarkStatus: (status: string | null) => void,
    setIsAlertVisible: (visible: boolean) => void
) => {
    try {
        await AsyncStorage.removeItem(`bookmark_${id}`);
        await AsyncStorage.removeItem(`title_${id}`);

        const keys = await AsyncStorage.getItem('bookmarkKeys');
        if (keys) {
            const bookmarkKeys = JSON.parse(keys);
            const updatedKeys = bookmarkKeys.filter((key: string) => key !== `bookmark_${id}`);
            await AsyncStorage.setItem('bookmarkKeys', JSON.stringify(updatedKeys));
        }

        setBookmarkStatus(null);
        setIsAlertVisible(false);

        // Set the bookmark changed flag
        await AsyncStorage.setItem('bookmarkChanged', 'true');
    } catch (error) {
        console.error('Error removing bookmark:', error);
    }
};

// New function to get the bookmark popup configuration
export const getBookmarkPopupConfig = (
    bookmarkStatus: string | null,
    mangaTitle: string,
    handleSaveBookmark: (status: BookmarkStatus) => void,
    handleRemoveBookmark: () => void
) => {
    return {
        title: bookmarkStatus
            ? `Update Bookmark for ${mangaTitle}`
            : `Bookmark ${mangaTitle}`,
        options: bookmarkStatus
            ? [
                {
                    text: 'To Read',
                    onPress: () => handleSaveBookmark('To Read'),
                    icon: 'book-outline',
                },
                {
                    text: 'Reading',
                    onPress: () => handleSaveBookmark('Reading'),
                    icon: 'book',
                },
                {
                    text: 'Read',
                    onPress: () => handleSaveBookmark('Read'),
                    icon: 'checkmark-circle-outline',
                },
                {
                    text: 'Unbookmark',
                    onPress: handleRemoveBookmark,
                    icon: 'close-circle-outline',
                },
            ]
            : [
                {
                    text: 'To Read',
                    onPress: () => handleSaveBookmark('To Read'),
                    icon: 'book-outline',
                },
                {
                    text: 'Reading',
                    onPress: () => handleSaveBookmark('Reading'),
                    icon: 'book',
                },
                {
                    text: 'Read',
                    onPress: () => handleSaveBookmark('Read'),
                    icon: 'checkmark-circle-outline',
                },
            ],
    };
};

// New function to handle chapter long press
export const getChapterLongPressAlertConfig = (
    isRead: boolean,
    chapterNumber: string,
    mangaDetails: any,
    id: string,
    readChapters: string[],
    setReadChapters: (chapters: string[]) => void
) => {
    if (!isRead) {
        return {
            type: 'confirm',
            title: 'Mark Chapters as Read',
            message: `Do you want to mark all chapters up to chapter ${chapterNumber} as read?`,
            options: [
                {
                    text: 'Cancel',
                    onPress: () => {},
                },
                {
                    text: 'Yes',
                    onPress: async () => {
                        try {
                            // Get all chapters up to the selected chapter
                            const chaptersToMark = mangaDetails?.chapters
                                .filter((ch: any) => {
                                    // Compare chapter numbers numerically
                                    const currentChapter = parseFloat(ch.number);
                                    const selectedChapter = parseFloat(chapterNumber);
                                    return currentChapter <= selectedChapter;
                                })
                                .map((ch: any) => ch.number) || [];

                            // Save to AsyncStorage
                            const key = `manga_${id}_read_chapters`;
                            const updatedReadChapters = Array.from(new Set([...readChapters, ...chaptersToMark]));
                            await AsyncStorage.setItem(key, JSON.stringify(updatedReadChapters));
                            setReadChapters(updatedReadChapters);
                        } catch (error) {
                            console.error('Error marking chapters as read:', error);
                        }
                    },
                },
            ],
        };
    }

    return null;
};
