import AsyncStorage from "@react-native-async-storage/async-storage";
import { getMangaData, setMangaData } from "./bookmarkService";
import { MangaData } from "@/types";

const LAST_READ_MANGA_KEY = "last_read_manga";

export interface LastReadManga {
  id: string;
  title: string;
  chapterNumber: string;
  timestamp: number;
}

export const getReadChapters = async (mangaId: string): Promise<string[]> => {
  try {
    const mangaData = await getMangaData(mangaId);
    return mangaData?.readChapters || [];
  } catch (error) {
    console.error("Error getting read chapters:", error);
    return [];
  }
};

export const getLastReadChapter = async (
  mangaId: string
): Promise<string | null> => {
  try {
    const mangaData = await getMangaData(mangaId);
    if (!mangaData?.readChapters || mangaData.readChapters.length === 0) {
      return "Not started";
    }

    // Calculate the highest chapter number from readChapters array
    const highestChapter = Math.max(
      ...mangaData.readChapters.map((ch) => parseFloat(ch))
    ).toString();

    return `Chapter ${highestChapter}`;
  } catch (error) {
    console.error("Error getting last read chapter:", error);
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
      const highestChapter = Math.max(
        ...updatedReadChapters.map((ch) => parseFloat(ch))
      ).toString();
      await setMangaData({
        ...mangaData,
        readChapters: updatedReadChapters,
        lastReadChapter: highestChapter,
        lastUpdated: Date.now(),
      });

      // Update last read manga info whenever a chapter is marked as read
      await setLastReadManga(mangaId, mangaData.title, chapterNumber);

      return updatedReadChapters;
    }
    return currentReadChapters;
  } catch (error) {
    console.error("Error marking chapter as read:", error);
    return currentReadChapters;
  }
};
export const markChapterAsUnread = async (
  mangaId: string,
  chapterNumber: string,
  currentReadChapters: string[]
): Promise<{
  updatedChapters: string[];
  newLastReadChapter: string | null;
}> => {
  try {
    const mangaData = await getMangaData(mangaId);
    if (mangaData) {
      const updatedReadChapters = currentReadChapters.filter(
        (chapter) => chapter !== chapterNumber
      );

      // Determine the new last read chapter
      let newLastReadChapter: string | null = null;
      if (updatedReadChapters.length > 0) {
        newLastReadChapter = Math.max(
          ...updatedReadChapters.map((ch) => parseFloat(ch))
        ).toString();
      }

      // Update manga data with new read chapters and last read chapter
      await setMangaData({
        ...mangaData,
        readChapters: updatedReadChapters,
        lastReadChapter: newLastReadChapter || undefined,
        lastUpdated: Date.now(),
      });

      // Update last read manga info if needed
      const lastReadManga = await getLastReadManga();
      if (
        lastReadManga &&
        lastReadManga.id === mangaId &&
        lastReadManga.chapterNumber === chapterNumber
      ) {
        if (newLastReadChapter) {
          await setLastReadManga(mangaId, mangaData.title, newLastReadChapter);
        } else if (updatedReadChapters.length === 0) {
          await setLastReadManga(mangaId, mangaData.title, "not_started");
        }
      }

      return {
        updatedChapters: updatedReadChapters,
        newLastReadChapter,
      };
    }
    return {
      updatedChapters: currentReadChapters,
      newLastReadChapter: null,
    };
  } catch (error) {
    console.error("Error marking chapter as unread:", error);
    return {
      updatedChapters: currentReadChapters,
      newLastReadChapter: null,
    };
  }
};

export const setLastReadManga = async (
  id: string,
  title: string,
  chapterNumber: string
): Promise<void> => {
  try {
    const lastReadManga: LastReadManga = {
      id,
      title,
      chapterNumber,
      timestamp: Date.now(),
    };

    console.log("Setting last read manga:", lastReadManga);
    await AsyncStorage.setItem(
      LAST_READ_MANGA_KEY,
      JSON.stringify(lastReadManga)
    );
  } catch (error) {
    console.error("Error setting last read manga:", error);
  }
};

export const getRecentlyReadManga = async (
  limit: number = 6
): Promise<MangaData[]> => {
  try {
    // Get all AsyncStorage keys
    const allKeys = await AsyncStorage.getAllKeys();

    // Filter for manga data keys (manga_*)
    const mangaKeys = allKeys.filter(
      (key) => key.startsWith("manga_") && !key.includes("_read_chapters")
    );

    const mangaDataArray = await Promise.all(
      mangaKeys.map(async (key) => {
        const data = await AsyncStorage.getItem(key);
        return data ? (JSON.parse(data) as MangaData) : null;
      })
    );

    const validManga = mangaDataArray.filter(
      (manga): manga is MangaData =>
        manga !== null &&
        manga.readChapters &&
        manga.readChapters.length > 0 &&
        !!manga.bannerImage
    );

    // Sort by lastUpdated timestamp (descending)
    validManga.sort((a, b) => (b.lastUpdated || 0) - (a.lastUpdated || 0));

    // Return the top {limit} items
    return validManga.slice(0, limit);
  } catch (error) {
    console.error("Error fetching recently read manga:", error);
    return [];
  }
};

export const getLastReadManga = async (): Promise<LastReadManga | null> => {
  try {
    const data = await AsyncStorage.getItem(LAST_READ_MANGA_KEY);
    if (!data) return null;

    const parsedData = JSON.parse(data) as LastReadManga;
    return parsedData;
  } catch (error) {
    console.error("Error getting last read manga:", error);
    return null;
  }
};
