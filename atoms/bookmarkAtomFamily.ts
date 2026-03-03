import {
  ion,
  injectStore,
  injectEffect,
  injectAtomInstance,
  api,
} from '@zedux/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { MangaData } from '@/types/manga';
import { logger } from '@/utils/logger';
import { bookmarkListAtom } from '@/atoms/bookmarkListAtom';

const MANGA_STORAGE_PREFIX = 'manga_';
const BOOKMARK_CHANGED_KEY = 'bookmarkChanged';

/**
 * Parameterized atom for individual manga bookmark data.
 * Each manga ID gets its own atom instance with persistence to AsyncStorage.
 *
 * Persists to AsyncStorage key: `manga_${mangaId}`
 */
export const bookmarkAtom = ion('bookmark', (_, mangaId: string) => {
  const store = injectStore<MangaData | null>(null);
  const bookmarkListInstance = injectAtomInstance(bookmarkListAtom);

  // Load initial state from AsyncStorage
  injectEffect(() => {
    const loadData = async () => {
      try {
        const key = `${MANGA_STORAGE_PREFIX}${mangaId}`;
        const stored = await AsyncStorage.getItem(key);
        if (stored) {
          const parsed = JSON.parse(stored) as MangaData;
          store.setState(parsed);
        }
      } catch (error) {
        logger().error('Storage', 'Failed to load manga data', {
          mangaId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    loadData();
  }, []);

  const persistMangaData = async (data: MangaData) => {
    try {
      const key = `${MANGA_STORAGE_PREFIX}${mangaId}`;
      await AsyncStorage.setItem(key, JSON.stringify(data));
      await AsyncStorage.setItem(BOOKMARK_CHANGED_KEY, 'true');
    } catch (error) {
      logger().error('Storage', 'Failed to persist manga data', {
        mangaId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const updateMangaData = async (updates: Partial<MangaData>) => {
    const current = store.getState();
    if (!current) return;

    const updated: MangaData = {
      ...current,
      ...updates,
      lastUpdated: Date.now(),
    };

    store.setState(updated);
    await persistMangaData(updated);

    // Notify parent bookmarkListAtom
    bookmarkListInstance.exports.updateBookmarkInList(updated);
  };

  const markChaptersAsRead = async (chapterNumbers: string[]) => {
    const current = store.getState();
    if (!current) return;

    const updatedReadChapters = Array.from(
      new Set([...(current.readChapters || []), ...chapterNumbers])
    );

    const highestChapter: string =
      updatedReadChapters.length > 0
        ? Math.max(
            ...updatedReadChapters.map((ch) => parseFloat(ch))
          ).toString()
        : '';

    const updated: MangaData = {
      ...current,
      readChapters: updatedReadChapters,
      lastReadChapter: highestChapter,
      lastUpdated: Date.now(),
    };

    store.setState(updated);
    await persistMangaData(updated);

    // Notify parent bookmarkListAtom
    bookmarkListInstance.exports.updateBookmarkInList(updated);
  };

  const markChapterAsUnread = async (
    chapterNumber: string,
    currentReadChapters: string[]
  ): Promise<{
    updatedChapters: string[];
    newLastReadChapter: string | null;
  }> => {
    const current = store.getState();
    if (!current) {
      return { updatedChapters: currentReadChapters, newLastReadChapter: null };
    }

    const updatedReadChapters = currentReadChapters.filter(
      (ch) => ch !== chapterNumber
    );

    let newLastReadChapter: string | null = null;
    if (updatedReadChapters.length > 0) {
      newLastReadChapter = Math.max(
        ...updatedReadChapters.map((ch) => parseFloat(ch))
      ).toString();
    }

    const updated: MangaData = {
      ...current,
      readChapters: updatedReadChapters,
      lastReadChapter: newLastReadChapter || '',
      lastUpdated: Date.now(),
    };

    store.setState(updated);
    await persistMangaData(updated);

    // Notify parent bookmarkListAtom
    bookmarkListInstance.exports.updateBookmarkInList(updated);

    return { updatedChapters: updatedReadChapters, newLastReadChapter };
  };

  const setMangaData = async (data: MangaData) => {
    store.setState(data);
    await persistMangaData(data);

    // Notify parent bookmarkListAtom
    bookmarkListInstance.exports.updateBookmarkInList(data);
  };

  return api(store).setExports({
    updateMangaData,
    markChaptersAsRead,
    markChapterAsUnread,
    setMangaData,
  });
});
