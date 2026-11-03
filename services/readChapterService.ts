import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMangaData, setMangaData, updateMangaData } from './bookmarkService';
import { MangaData } from '@/types';
import { isDebugEnabled } from '@/constants/env';
import { logger } from '@/utils/logger';

const LAST_READ_MANGA_KEY = 'last_read_manga';

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
    logger().error('Service', 'Error getting read chapters', { error });
    return [];
  }
};

export const getLastReadChapter = async (
  mangaId: string
): Promise<string | null> => {
  try {
    const mangaData = await getMangaData(mangaId);
    if (!mangaData?.readChapters || mangaData.readChapters.length === 0) {
      return 'Not started';
    }

    // Calculate the highest chapter number from readChapters array
    const highestChapter = Math.max(
      ...mangaData.readChapters.map((ch) => parseFloat(ch))
    ).toString();

    return `Chapter ${highestChapter}`;
  } catch (error) {
    logger().error('Service', 'Error getting last read chapter', { error });
    return null;
  }
};

/** Load search-result progress with one native storage operation. */
export const getLastReadChapters = async (
  mangaIds: string[]
): Promise<Record<string, string | null>> => {
  const ids = Array.from(
    new Set(mangaIds.map((id) => id.trim()).filter(Boolean))
  );
  if (ids.length === 0) {
    return {};
  }

  try {
    const entries = await AsyncStorage.multiGet(ids.map((id) => `manga_${id}`));
    const chapters: Record<string, string | null> = {};

    entries.forEach(([, raw], index) => {
      const id = ids[index];
      if (!id) {
        return;
      }

      try {
        const mangaData = raw ? (JSON.parse(raw) as MangaData) : null;
        if (!mangaData?.readChapters?.length) {
          chapters[id] = 'Not started';
          return;
        }

        const highestChapter = Math.max(
          ...mangaData.readChapters.map((chapter) => Number.parseFloat(chapter))
        );
        chapters[id] = Number.isFinite(highestChapter)
          ? `Chapter ${highestChapter}`
          : null;
      } catch {
        chapters[id] = null;
      }
    });

    return chapters;
  } catch (error) {
    logger().warn('Storage', 'Failed to bulk-load last read chapters', {
      error,
      mangaCount: ids.length,
    });
    return {};
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
    logger().error('Service', 'Error marking chapter as read', { error });
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
    // Everything runs inside the per-manga write queue and starts from stored
    // state — not the caller's snapshot, which is stale when unreads are tapped
    // in quick succession and would re-add the previously unread chapter.
    const mangaData = await updateMangaData(mangaId, async (existing) => {
      if (!existing) return null;
      const readChapters = (existing.readChapters || []).filter(
        (chapter) => chapter !== chapterNumber
      );
      const lastReadChapter =
        readChapters.length > 0
          ? Math.max(...readChapters.map((ch) => parseFloat(ch))).toString()
          : '';

      const lastReadManga = await getLastReadManga();
      if (
        lastReadManga?.id === mangaId &&
        lastReadManga.chapterNumber === chapterNumber
      ) {
        await setLastReadManga(
          mangaId,
          existing.title,
          lastReadChapter || 'not_started'
        );
      }

      return {
        ...existing,
        readChapters,
        lastReadChapter,
        lastUpdated: Date.now(),
      };
    });
    if (mangaData) {
      return {
        updatedChapters: mangaData.readChapters || [],
        newLastReadChapter: mangaData.lastReadChapter || null,
      };
    }
    return {
      updatedChapters: currentReadChapters,
      newLastReadChapter: null,
    };
  } catch (error) {
    logger().error('Service', 'Error marking chapter as unread', { error });
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

    if (isDebugEnabled())
      logger().debug('Service', 'Setting last read manga', { lastReadManga });
    await AsyncStorage.setItem(
      LAST_READ_MANGA_KEY,
      JSON.stringify(lastReadManga)
    );
  } catch (error) {
    logger().error('Service', 'Error setting last read manga', { error });
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
      (key) => key.startsWith('manga_') && !key.includes('_read_chapters')
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
    logger().error('Service', 'Error fetching recently read manga', { error });
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
    logger().error('Service', 'Error getting last read manga', { error });
    return null;
  }
};
