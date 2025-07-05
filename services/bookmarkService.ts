import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'html-entities';
import { Alert } from 'react-native';
import { updateAniListStatus } from './anilistService';
import { BookmarkStatus, MangaData, IconName } from '@/types';

const MANGA_STORAGE_PREFIX = 'manga_';

export const getMangaData = async (id: string): Promise<MangaData | null> => {
  try {
    const value = await AsyncStorage.getItem(`${MANGA_STORAGE_PREFIX}${id}`);
    return value ? JSON.parse(value) : null;
  } catch (e) {
    console.error('Error reading manga data:', e);
    return null;
  }
};

export const setMangaData = async (data: MangaData): Promise<void> => {
  try {
    await AsyncStorage.setItem(
      `${MANGA_STORAGE_PREFIX}${data.id}`,
      JSON.stringify(data)
    );
    // Update bookmarkKeys for backwards compatibility and listing
    const keys = await AsyncStorage.getItem('bookmarkKeys');
    const bookmarkKeys = keys ? JSON.parse(keys) : [];
    if (data.bookmarkStatus && !bookmarkKeys.includes(`bookmark_${data.id}`)) {
      bookmarkKeys.push(`bookmark_${data.id}`);
      await AsyncStorage.setItem('bookmarkKeys', JSON.stringify(bookmarkKeys));
    }
    // Set the bookmark changed flag
    await AsyncStorage.setItem('bookmarkChanged', 'true');
  } catch (e) {
    console.error('Error saving manga data:', e);
  }
};

export const fetchBookmarkStatus = async (
  id: string
): Promise<string | null> => {
  const mangaData = await getMangaData(id);
  return mangaData?.bookmarkStatus || null;
};

const markAllChaptersAsRead = async (
  id: string,
  mangaDetails: any,
  setReadChapters: (chapters: string[]) => void
) => {
  try {
    if (mangaDetails?.chapters?.length > 0) {
      const allChapterNumbers = mangaDetails.chapters.map(
        (chapter: any) => chapter.number
      );
      const mangaData = (await getMangaData(id)) || {
        id,
        title: decode(mangaDetails.title || ''),
        bannerImage: mangaDetails.bannerImage || '',
        bookmarkStatus: null,
        readChapters: [],
        lastUpdated: Date.now(),
        totalChapters: mangaDetails.chapters.length,
      };

      // Get the highest chapter number to set as lastReadChapter
      const lastChapter = Math.max(
        ...allChapterNumbers.map((num: string) => parseFloat(num))
      ).toString();
      await setMangaData({
        ...mangaData,
        readChapters: allChapterNumbers,
        lastReadChapter: lastChapter,
        lastUpdated: Date.now(),
      });
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
    const mangaData: MangaData = {
      id,
      title: decode(mangaDetails?.title || ''),
      bannerImage: mangaDetails?.bannerImage || '',
      bookmarkStatus: status,
      readChapters,
      lastUpdated: Date.now(),
      totalChapters: mangaDetails?.chapters?.length,
    };

    if (status === 'Reading' && mangaDetails?.chapters?.length > 0) {
      mangaData.lastNotifiedChapter = mangaDetails.chapters[0].number;
    }

    await setMangaData(mangaData);
    setBookmarkStatus(status);
    setIsAlertVisible(false);

    if (status === 'Read') {
      Alert.alert(
        'Mark All Chapters as Read',
        'Do you want to mark all chapters as read?',
        [
          {
            text: 'No',
            style: 'cancel',
            onPress: async () => {
              // Update lastReadChapter to the highest read chapter
              if (readChapters.length > 0) {
                const highestReadChapter = Math.max(
                  ...readChapters.map((num: string) => parseFloat(num))
                ).toString();
                await setMangaData({
                  ...mangaData,
                  lastReadChapter: highestReadChapter,
                });
              }
              await updateAniListStatus(
                mangaDetails?.title,
                status,
                readChapters,
                mangaDetails?.chapters.length
              );
            },
          },
          {
            text: 'Yes',
            onPress: async () => {
              await markAllChaptersAsRead(id, mangaDetails, setReadChapters);
              await updateAniListStatus(
                mangaDetails?.title,
                status,
                readChapters,
                mangaDetails?.chapters.length
              );
            },
          },
        ]
      );
    } else if (status !== 'On Hold') {
      // Only update AniList if status is not "On Hold" since that status doesn't exist on AniList
      await updateAniListStatus(
        mangaDetails?.title,
        status,
        readChapters,
        mangaDetails?.chapters.length
      );
    }
  } catch (error) {
    console.error('Error saving bookmark:', error);
    Alert.alert('Error', 'Failed to update status. Please try again.');
  }
};

export const removeBookmark = async (
  id: string,
  setBookmarkStatus: (status: string | null) => void,
  setIsAlertVisible: (visible: boolean) => void
) => {
  try {
    await AsyncStorage.removeItem(`${MANGA_STORAGE_PREFIX}${id}`);

    const keys = await AsyncStorage.getItem('bookmarkKeys');
    if (keys) {
      const bookmarkKeys = JSON.parse(keys);
      const updatedKeys = bookmarkKeys.filter(
        (key: string) => key !== `bookmark_${id}`
      );
      await AsyncStorage.setItem('bookmarkKeys', JSON.stringify(updatedKeys));
    }

    setBookmarkStatus(null);
    setIsAlertVisible(false);
    await AsyncStorage.setItem('bookmarkChanged', 'true');
  } catch (error) {
    console.error('Error removing bookmark:', error);
  }
};

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
            icon: 'book-outline' as IconName,
          },
          {
            text: 'Reading',
            onPress: () => handleSaveBookmark('Reading'),
            icon: 'book' as IconName,
          },
          {
            text: 'On Hold',
            onPress: () => handleSaveBookmark('On Hold'),
            icon: 'pause-circle-outline' as IconName,
          },
          {
            text: 'Read',
            onPress: () => handleSaveBookmark('Read'),
            icon: 'checkmark-circle-outline' as IconName,
          },
          {
            text: 'Unbookmark',
            onPress: handleRemoveBookmark,
            icon: 'close-circle-outline' as IconName,
          },
        ]
      : [
          {
            text: 'To Read',
            onPress: () => handleSaveBookmark('To Read'),
            icon: 'book-outline' as IconName,
          },
          {
            text: 'Reading',
            onPress: () => handleSaveBookmark('Reading'),
            icon: 'book' as IconName,
          },
          {
            text: 'On Hold',
            onPress: () => handleSaveBookmark('On Hold'),
            icon: 'pause-circle-outline' as IconName,
          },
          {
            text: 'Read',
            onPress: () => handleSaveBookmark('Read'),
            icon: 'checkmark-circle-outline' as IconName,
          },
        ],
  };
};

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
              const chaptersToMark =
                mangaDetails?.chapters
                  .filter((ch: any) => {
                    const currentChapter = parseFloat(ch.number);
                    const selectedChapter = parseFloat(chapterNumber);
                    return currentChapter <= selectedChapter;
                  })
                  .map((ch: any) => ch.number) || [];

              const mangaData = await getMangaData(id);
              if (mangaData) {
                const updatedReadChapters = Array.from(
                  new Set([...readChapters, ...chaptersToMark])
                );
                const highestChapter = Math.max(
                  ...updatedReadChapters.map((ch) => parseFloat(ch))
                ).toString();
                await setMangaData({
                  ...mangaData,
                  readChapters: updatedReadChapters,
                  lastReadChapter: highestChapter, // Using highest chapter number
                  lastUpdated: Date.now(),
                });
                setReadChapters(updatedReadChapters);
              }
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
