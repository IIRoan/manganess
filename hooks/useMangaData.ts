import { useAtomValue, useAtomInstance } from '@zedux/react';
import { bookmarkAtom } from '@/atoms/bookmarkAtomFamily';
import { MangaData } from '@/types/manga';

/**
 * Hook to access individual manga bookmark data and actions.
 *
 * Provides reactive access to a single manga's data by ID,
 * with functions to update data and mark chapters as read/unread.
 */
export const useMangaData = (mangaId: string) => {
  const mangaData = useAtomValue(bookmarkAtom, [mangaId]);
  const instance = useAtomInstance(bookmarkAtom, [mangaId]);

  return {
    mangaData,
    updateMangaData: instance.exports.updateMangaData as (
      updates: Partial<MangaData>
    ) => Promise<void>,
    markChaptersAsRead: instance.exports.markChaptersAsRead as (
      chapterNumbers: string[]
    ) => Promise<void>,
    markChapterAsUnread: instance.exports.markChapterAsUnread as (
      chapterNumber: string,
      currentReadChapters: string[]
    ) => Promise<{
      updatedChapters: string[];
      newLastReadChapter: string | null;
    }>,
    setMangaData: instance.exports.setMangaData as (
      data: MangaData
    ) => Promise<void>,
  };
};
