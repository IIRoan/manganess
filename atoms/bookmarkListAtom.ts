import { atom, injectStore, injectEffect, api } from '@zedux/react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { BookmarkListAtomState } from '@/types/atoms';
import { MangaData } from '@/types/manga';
import { logger } from '@/utils/logger';
import { offlineCacheService } from '@/services/offlineCacheService';

const MANGA_STORAGE_PREFIX = 'manga_';
const BOOKMARK_KEYS_KEY = 'bookmarkKeys';
const BOOKMARK_CHANGED_KEY = 'bookmarkChanged';

/**
 * Bookmark List Atom
 *
 * Manages the list of all bookmarked manga. Loads all bookmarks from AsyncStorage
 * on initialization by reading the `bookmarkKeys` index and fetching each entry.
 *
 * Key behaviors:
 * - Maintains `bookmarkKeys` array for backwards compatibility with legacy code
 * - Sets `bookmarkChanged` flag in AsyncStorage on every mutation
 * - Triggers offline cache update when bookmarks change
 * - `addBookmark` is idempotent — updates in-place if manga already bookmarked
 *
 * Dependencies: offlineCacheService (for cache updates, non-critical)
 * Persistence: AsyncStorage keys `bookmarkKeys` + `manga_${id}` per bookmark
 *
 * @see hooks/useBookmarks.ts for React hook access
 * @see atoms/bookmarkAtomFamily.ts for per-manga atom instances
 * @see atoms/selectors/bookmarkSelectors.ts for derived selectors
 * @see Requirements 5.1–5.7
 */
export const bookmarkListAtom = atom('bookmarkList', () => {
  const store = injectStore<BookmarkListAtomState>({
    bookmarks: [],
    bookmarkKeys: [],
    lastUpdated: 0,
  });

  // Load all bookmarks from AsyncStorage on initialization
  injectEffect(() => {
    const loadBookmarks = async () => {
      const log = logger();
      try {
        const raw = await AsyncStorage.getItem(BOOKMARK_KEYS_KEY);
        const keys: string[] = raw ? JSON.parse(raw) : [];

        const bookmarks = await Promise.all(
          keys.map(async (key: string) => {
            const id = key.replace('bookmark_', '');
            if (!id) return null;
            try {
              const value = await AsyncStorage.getItem(
                `${MANGA_STORAGE_PREFIX}${id}`
              );
              return value ? (JSON.parse(value) as MangaData) : null;
            } catch {
              return null;
            }
          })
        );

        const validBookmarks = bookmarks.filter(
          (b): b is MangaData => b !== null
        );

        store.setState({
          bookmarks: validBookmarks,
          bookmarkKeys: keys,
          lastUpdated: Date.now(),
        });

        log.info('Storage', 'Loaded bookmarks', {
          count: validBookmarks.length,
        });
      } catch (error) {
        log.error('Storage', 'Failed to load bookmarks', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    loadBookmarks();
  }, []);

  const setBookmarkChanged = async () => {
    try {
      await AsyncStorage.setItem(BOOKMARK_CHANGED_KEY, 'true');
    } catch (error) {
      logger().error('Storage', 'Failed to set bookmarkChanged flag', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const persistBookmarkKeys = async (keys: string[]) => {
    try {
      await AsyncStorage.setItem(BOOKMARK_KEYS_KEY, JSON.stringify(keys));
    } catch (error) {
      logger().error('Storage', 'Failed to persist bookmarkKeys', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const addBookmark = async (manga: MangaData) => {
    const log = logger();
    try {
      // Persist individual manga data
      await AsyncStorage.setItem(
        `${MANGA_STORAGE_PREFIX}${manga.id}`,
        JSON.stringify(manga)
      );

      const currentState = store.getState();
      const bookmarkKey = `bookmark_${manga.id}`;

      // Check if already bookmarked - update in place
      const existingIndex = currentState.bookmarks.findIndex(
        (b) => b.id === manga.id
      );
      let updatedBookmarks: MangaData[];
      let updatedKeys: string[];

      if (existingIndex >= 0) {
        updatedBookmarks = [...currentState.bookmarks];
        updatedBookmarks[existingIndex] = manga;
        updatedKeys = currentState.bookmarkKeys;
      } else {
        updatedBookmarks = [...currentState.bookmarks, manga];
        updatedKeys = [...currentState.bookmarkKeys, bookmarkKey];
      }

      store.setState({
        bookmarks: updatedBookmarks,
        bookmarkKeys: updatedKeys,
        lastUpdated: Date.now(),
      });

      await persistBookmarkKeys(updatedKeys);
      await setBookmarkChanged();

      // Trigger offline cache for bookmarked manga
      try {
        await offlineCacheService.updateMangaBookmarkStatus(manga.id, true);
      } catch {
        // Non-critical, don't fail the bookmark operation
      }

      log.info('Storage', 'Bookmark added', { mangaId: manga.id });
    } catch (error) {
      log.error('Storage', 'Failed to add bookmark', {
        mangaId: manga.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const removeBookmark = async (mangaId: string) => {
    const log = logger();
    try {
      await AsyncStorage.removeItem(`${MANGA_STORAGE_PREFIX}${mangaId}`);

      const currentState = store.getState();
      const bookmarkKey = `bookmark_${mangaId}`;

      const updatedBookmarks = currentState.bookmarks.filter(
        (b) => b.id !== mangaId
      );
      const updatedKeys = currentState.bookmarkKeys.filter(
        (k) => k !== bookmarkKey
      );

      store.setState({
        bookmarks: updatedBookmarks,
        bookmarkKeys: updatedKeys,
        lastUpdated: Date.now(),
      });

      await persistBookmarkKeys(updatedKeys);
      await setBookmarkChanged();

      // Update offline cache
      try {
        await offlineCacheService.updateMangaBookmarkStatus(mangaId, false);
      } catch {
        // Non-critical
      }

      log.info('Storage', 'Bookmark removed', { mangaId });
    } catch (error) {
      log.error('Storage', 'Failed to remove bookmark', {
        mangaId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const refreshBookmarks = async () => {
    const log = logger();
    try {
      const raw = await AsyncStorage.getItem(BOOKMARK_KEYS_KEY);
      const keys: string[] = raw ? JSON.parse(raw) : [];

      const bookmarks = await Promise.all(
        keys.map(async (key: string) => {
          const id = key.replace('bookmark_', '');
          if (!id) return null;
          try {
            const value = await AsyncStorage.getItem(
              `${MANGA_STORAGE_PREFIX}${id}`
            );
            return value ? (JSON.parse(value) as MangaData) : null;
          } catch {
            return null;
          }
        })
      );

      const validBookmarks = bookmarks.filter(
        (b): b is MangaData => b !== null
      );

      store.setState({
        bookmarks: validBookmarks,
        bookmarkKeys: keys,
        lastUpdated: Date.now(),
      });
    } catch (error) {
      log.error('Storage', 'Failed to refresh bookmarks', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const updateBookmarkInList = (manga: MangaData) => {
    const currentState = store.getState();
    const index = currentState.bookmarks.findIndex((b) => b.id === manga.id);
    if (index >= 0) {
      const updatedBookmarks = [...currentState.bookmarks];
      updatedBookmarks[index] = manga;
      store.setState({
        ...currentState,
        bookmarks: updatedBookmarks,
        lastUpdated: Date.now(),
      });
    }
  };

  return api(store).setExports({
    addBookmark,
    removeBookmark,
    refreshBookmarks,
    updateBookmarkInList,
  });
});
