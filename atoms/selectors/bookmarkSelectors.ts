import { useMemo } from 'react';
import { useAtomValue } from '@zedux/react';
import { bookmarkListAtom } from '@/atoms/bookmarkListAtom';

/**
 * Selector: returns the total number of bookmarks.
 */
export const useBookmarkCount = () => {
  const { bookmarks } = useAtomValue(bookmarkListAtom);
  return bookmarks.length;
};

/**
 * Selector: returns bookmarks with status 'Reading'.
 * Memoized to avoid re-filtering on every render.
 */
export const useReadingManga = () => {
  const { bookmarks } = useAtomValue(bookmarkListAtom);
  return useMemo(
    () => bookmarks.filter((b) => b.bookmarkStatus === 'Reading'),
    [bookmarks]
  );
};

/**
 * Selector: returns bookmarks with status 'To Read'.
 * Memoized to avoid re-filtering on every render.
 */
export const useToReadManga = () => {
  const { bookmarks } = useAtomValue(bookmarkListAtom);
  return useMemo(
    () => bookmarks.filter((b) => b.bookmarkStatus === 'To Read'),
    [bookmarks]
  );
};
