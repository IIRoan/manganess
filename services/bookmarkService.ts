import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'html-entities';
import { Alert } from 'react-native';
import { updateAniListStatus } from './anilistService';

export type BookmarkStatus = "To Read" | "Reading" | "Read";

export const fetchBookmarkStatus = async (id: string): Promise<string | null> => {
    return await AsyncStorage.getItem(`bookmark_${id}`);
};

export const saveBookmark = async (
    id: string,
    status: BookmarkStatus,
    mangaDetails: any,
    readChapters: string[],
    setBookmarkStatus: (status: string | null) => void,
    setIsAlertVisible: (visible: boolean) => void,
    markAllChaptersAsRead: () => Promise<void>
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
                        onPress: () => updateAniListStatusAndAlert(mangaDetails?.title, status, readChapters, mangaDetails?.chapters.length)
                    },
                    {
                        text: "Yes",
                        onPress: async () => {
                            await markAllChaptersAsRead();
                            await updateAniListStatusAndAlert(mangaDetails?.title, status, readChapters, mangaDetails?.chapters.length);
                        }
                    }
                ]
            );
        } else {
            await updateAniListStatusAndAlert(mangaDetails?.title, status, readChapters, mangaDetails?.chapters.length);
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

const updateAniListStatusAndAlert = async (
    mangaTitle: string,
    status: BookmarkStatus,
    readChapters: string[],
    totalChapters: number
) => {
    const result = await updateAniListStatus(
        mangaTitle,
        status,
        readChapters,
        totalChapters
    );

    if (result.success) {
        Alert.alert("Success", result.message);
    } else {
        Alert.alert("Note", result.message);
    }
};
