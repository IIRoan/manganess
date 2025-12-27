import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'html-entities';
import { Alert } from 'react-native';
import { updateAniListStatus } from './anilistService';
import { offlineCacheService } from './offlineCacheService';
import {
  BookmarkStatus,
  MangaData,
  IconName,
  DownloadProgress,
  DownloadStatus,
} from '@/types';

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

    // Cache manga details for offline access when bookmarked
    if (mangaDetails) {
      await offlineCacheService.cacheMangaDetails(
        id,
        { ...mangaDetails, id },
        true
      );
    }

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

    // Update offline cache to mark as not bookmarked
    await offlineCacheService.updateMangaBookmarkStatus(id, false);

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
  // Truncate title if too long for popup
  const displayTitle =
    mangaTitle.length > 25 ? mangaTitle.substring(0, 25) + '...' : mangaTitle;

  const baseOptions = [
    {
      text: 'To Read',
      onPress: () => handleSaveBookmark('To Read'),
      icon: 'book-outline' as IconName,
      isSelected: bookmarkStatus === 'To Read',
    },
    {
      text: 'Reading',
      onPress: () => handleSaveBookmark('Reading'),
      icon: 'book' as IconName,
      isSelected: bookmarkStatus === 'Reading',
    },
    {
      text: 'On Hold',
      onPress: () => handleSaveBookmark('On Hold'),
      icon: 'pause-circle-outline' as IconName,
      isSelected: bookmarkStatus === 'On Hold',
    },
    {
      text: 'Read',
      onPress: () => handleSaveBookmark('Read'),
      icon: 'checkmark-circle-outline' as IconName,
      isSelected: bookmarkStatus === 'Read',
    },
  ];

  return {
    title: bookmarkStatus
      ? `Update "${displayTitle}"`
      : `Bookmark "${displayTitle}"`,
    options: bookmarkStatus
      ? [
          ...baseOptions,
          {
            text: 'Unbookmark',
            onPress: handleRemoveBookmark,
            icon: 'close-circle-outline' as IconName,
            isSelected: false,
          },
        ]
      : baseOptions,
  };
};

export const getChapterLongPressAlertConfig = (
  isRead: boolean,
  chapterNumber: string,
  mangaDetails: any,
  id: string,
  readChapters: string[],
  setReadChapters: (chapters: string[]) => void,
  onSuccess?: (markedCount: number, chapterNumber: string) => void,
  onError?: () => void
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

                // Call success callback with the count of newly marked chapters
                const newlyMarkedCount = chaptersToMark.filter(
                  (ch: string) => !readChapters.includes(ch)
                ).length;
                onSuccess?.(newlyMarkedCount, chapterNumber);
              }
            } catch (error) {
              console.error('Error marking chapters as read:', error);
              onError?.();
            }
          },
        },
      ],
    };
  }
  return null;
};

// Download-related functions for MangaData management

export const updateDownloadStatus = async (
  mangaId: string,
  chapterNumber: string,
  downloadProgress: DownloadProgress
): Promise<void> => {
  try {
    const mangaData = await getMangaData(mangaId);
    if (!mangaData) {
      console.warn(`No manga data found for ID: ${mangaId}`);
      return;
    }

    const updatedData: MangaData = {
      ...mangaData,
      downloadStatus: {
        ...mangaData.downloadStatus,
        [chapterNumber]: downloadProgress,
      },
      lastUpdated: Date.now(),
    };

    // If download is completed, add to downloadedChapters
    if (downloadProgress.status === DownloadStatus.COMPLETED) {
      const downloadedChapters = mangaData.downloadedChapters || [];
      if (!downloadedChapters.includes(chapterNumber)) {
        updatedData.downloadedChapters = [...downloadedChapters, chapterNumber];
      }
    }

    await setMangaData(updatedData);
  } catch (error) {
    console.error('Error updating download status:', error);
  }
};

export const removeDownloadStatus = async (
  mangaId: string,
  chapterNumber: string
): Promise<void> => {
  try {
    const mangaData = await getMangaData(mangaId);
    if (!mangaData) return;

    const updatedDownloadStatus = { ...mangaData.downloadStatus };
    delete updatedDownloadStatus[chapterNumber];

    const downloadedChapters = (mangaData.downloadedChapters || []).filter(
      (ch) => ch !== chapterNumber
    );

    const updatedData: MangaData = {
      ...mangaData,
      downloadStatus: updatedDownloadStatus,
      downloadedChapters,
      lastUpdated: Date.now(),
    };

    await setMangaData(updatedData);
  } catch (error) {
    console.error('Error removing download status:', error);
  }
};

export const updateTotalDownloadSize = async (
  mangaId: string,
  sizeChange: number
): Promise<void> => {
  try {
    const mangaData = await getMangaData(mangaId);
    if (!mangaData) return;

    const currentSize = mangaData.totalDownloadSize || 0;
    const updatedData: MangaData = {
      ...mangaData,
      totalDownloadSize: Math.max(0, currentSize + sizeChange),
      lastUpdated: Date.now(),
    };

    await setMangaData(updatedData);
  } catch (error) {
    console.error('Error updating total download size:', error);
  }
};

export const getDownloadedChapters = async (
  mangaId: string
): Promise<string[]> => {
  try {
    const mangaData = await getMangaData(mangaId);
    return mangaData?.downloadedChapters || [];
  } catch (error) {
    console.error('Error getting downloaded chapters:', error);
    return [];
  }
};

export const getChapterDownloadStatus = async (
  mangaId: string,
  chapterNumber: string
): Promise<DownloadProgress | null> => {
  try {
    const mangaData = await getMangaData(mangaId);
    return mangaData?.downloadStatus?.[chapterNumber] || null;
  } catch (error) {
    console.error('Error getting chapter download status:', error);
    return null;
  }
};

export const isChapterDownloaded = async (
  mangaId: string,
  chapterNumber: string
): Promise<boolean> => {
  try {
    const downloadedChapters = await getDownloadedChapters(mangaId);
    return downloadedChapters.includes(chapterNumber);
  } catch (error) {
    console.error('Error checking if chapter is downloaded:', error);
    return false;
  }
};

export const getAllDownloadedManga = async (): Promise<MangaData[]> => {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const mangaKeys = keys.filter((key) =>
      key.startsWith(MANGA_STORAGE_PREFIX)
    );

    const mangaDataPromises = mangaKeys.map(async (key) => {
      const value = await AsyncStorage.getItem(key);
      return value ? (JSON.parse(value) as MangaData) : null;
    });

    const allMangaData = await Promise.all(mangaDataPromises);

    // Filter to only include manga with downloaded chapters
    return allMangaData.filter(
      (data): data is MangaData =>
        data !== null &&
        data.downloadedChapters !== undefined &&
        data.downloadedChapters.length > 0
    );
  } catch (error) {
    console.error('Error getting all downloaded manga:', error);
    return [];
  }
};

export const getTotalDownloadSize = async (): Promise<number> => {
  try {
    const downloadedManga = await getAllDownloadedManga();
    return downloadedManga.reduce(
      (total, manga) => total + (manga.totalDownloadSize || 0),
      0
    );
  } catch (error) {
    console.error('Error calculating total download size:', error);
    return 0;
  }
};
