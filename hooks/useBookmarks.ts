import { useAtomValue, useAtomInstance } from '@zedux/react';
import { bookmarkListAtom } from '@/atoms/bookmarkListAtom';
import { MangaData } from '@/types/manga';

/**
 * Hook to access bookmark list state and actions.
 *
 * Provides the same data as the old bookmarkService-based approach
 * but through reactive Zedux atoms.
 */
export const useBookmarks = () => {
  const state = useAtomValue(bookmarkListAtom);
  const instance = useAtomInstance(bookmarkListAtom);

  return {
    bookmarks: state.bookmarks,
    bookmarkKeys: state.bookmarkKeys,
    lastUpdated: state.lastUpdated,
    addBookmark: instance.exports.addBookmark as (
      manga: MangaData
    ) => Promise<void>,
    removeBookmark: instance.exports.removeBookmark as (
      mangaId: string
    ) => Promise<void>,
    refreshBookmarks: instance.exports.refreshBookmarks as () => Promise<void>,
  };
};
