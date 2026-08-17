/**
 * @deprecated FULLY DEPRECATED - Part of Zedux state migration Phase 7 cleanup.
 * This service is no longer maintained and will be removed once all consumers are migrated.
 *
 * Migration status:
 * - Bookmark list management → atoms/bookmarkListAtom.ts + hooks/useBookmarks.ts
 * - Individual manga data → atoms/bookmarkAtomFamily.ts + hooks/useMangaData.ts
 * - Bookmark selectors → atoms/selectors/bookmarkSelectors.ts
 *
 * Functions still in use during migration:
 * - saveBookmark (contains AniList sync + Alert dialog logic)
 * - removeBookmark (contains AniList sync logic)
 * - getBookmarkPopupConfig (pure UI config function)
 * - getChapterLongPressAlertConfig (pure UI config function)
 * - getMangaData / setMangaData (used by readChapterService, mangaFireService, chapter reader)
 * - Download-related functions (updateDownloadStatus, etc.)
 *
 * These remaining functions will be migrated in subsequent phases.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'html-entities';
import { Alert } from 'react-native';
import { offlineCacheService } from './offlineCacheService';
import { logger } from '@/utils/logger';
import {
  applyHeaderToMangaData,
  extractMangaHeader,
  hasLoadedMangaHeader,
} from '@/utils/mangaHeader';
import type { MangaDetails } from '@/types/manga';
import {
  BookmarkStatus,
  MangaData,
  IconName,
  DownloadProgress,
  DownloadStatus,
} from '@/types';

const MANGA_STORAGE_PREFIX = 'manga_';

const BOOKMARK_KEYS_KEY = 'bookmarkKeys';
const BOOKMARK_CHANGED_KEY = 'bookmarkChanged';

const getNumericChapterValue = (chapter?: string): number | null => {
  if (!chapter) {
    return null;
  }

  const parsed = Number.parseFloat(String(chapter));
  return Number.isFinite(parsed) ? parsed : null;
};

const resolveLastReadChapter = (
  sourceLastReadChapter?: string,
  targetLastReadChapter?: string,
  readChapters: string[] = []
): string | undefined => {
  const explicitChapters = [
    sourceLastReadChapter,
    targetLastReadChapter,
  ].filter((chapter): chapter is string => Boolean(chapter));

  const explicitValues = explicitChapters
    .map((chapter) => ({
      chapter,
      value: getNumericChapterValue(chapter),
    }))
    .filter(
      (entry): entry is { chapter: string; value: number } =>
        entry.value !== null
    );

  if (explicitValues.length > 0) {
    explicitValues.sort((left, right) => right.value - left.value);
    return explicitValues[0]?.chapter;
  }

  if (explicitChapters.length > 0) {
    return explicitChapters[0];
  }

  const chapterValues = readChapters
    .map((chapter) => ({
      chapter,
      value: getNumericChapterValue(chapter),
    }))
    .filter(
      (entry): entry is { chapter: string; value: number } =>
        entry.value !== null
    )
    .sort((left, right) => right.value - left.value);

  return chapterValues[0]?.chapter;
};

// TODO: Re-enable AniList sync once the frontend integration is stabilised.
// const updateAniListStatusForBookmark = async (
//   mangaTitle: string,
//   status: 'To Read' | 'Reading' | 'Read',
//   readChapters: string[],
//   totalChapters: number
// ) => {
//   const { updateAniListStatus } = getAniListService();
//   return updateAniListStatus(mangaTitle, status, readChapters, totalChapters);
// };

const inflightMangaData = new Map<string, Promise<MangaData | null>>();
const mangaDataWriteChains = new Map<string, Promise<unknown>>();

function enqueueMangaDataWrite<T>(
  mangaId: string,
  task: () => Promise<T>
): Promise<T> {
  const previous = mangaDataWriteChains.get(mangaId) ?? Promise.resolve();
  const next = previous.then(task, task);
  mangaDataWriteChains.set(
    mangaId,
    next.then(
      () => undefined,
      () => undefined
    )
  );
  return next;
}

async function readMangaDataRecord(id: string): Promise<MangaData | null> {
  try {
    const value = await AsyncStorage.getItem(`${MANGA_STORAGE_PREFIX}${id}`);
    return value ? JSON.parse(value) : null;
  } catch (e) {
    console.error('Error reading manga data:', e);
    return null;
  }
}

export const getMangaData = async (id: string): Promise<MangaData | null> => {
  const pendingWrite = mangaDataWriteChains.get(id);
  if (pendingWrite) {
    await pendingWrite;
  }

  const existing = inflightMangaData.get(id);
  if (existing) {
    return existing;
  }

  const pending = readMangaDataRecord(id);

  inflightMangaData.set(id, pending);
  try {
    return await pending;
  } finally {
    inflightMangaData.delete(id);
  }
};

export async function removeBookmarkKeyFromIndex(
  mangaId: string
): Promise<void> {
  const normalizedId = mangaId.trim();
  if (!normalizedId) {
    return;
  }

  try {
    const raw = await AsyncStorage.getItem(BOOKMARK_KEYS_KEY);
    const bookmarkKeys: string[] = raw ? JSON.parse(raw) : [];
    const bookmarkKey = `bookmark_${normalizedId}`;
    const nextKeys = bookmarkKeys.filter((key) => key !== bookmarkKey);

    if (nextKeys.length !== bookmarkKeys.length) {
      await AsyncStorage.setItem(BOOKMARK_KEYS_KEY, JSON.stringify(nextKeys));
    }
  } catch (error) {
    logger().warn('Storage', 'Failed to remove bookmark index entry', {
      mangaId: normalizedId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function pruneStaleBookmarkIndexEntries(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(BOOKMARK_KEYS_KEY);
    if (!raw) {
      return 0;
    }

    const bookmarkKeys: string[] = JSON.parse(raw);
    const kept: string[] = [];
    let removed = 0;

    for (const key of bookmarkKeys) {
      const id = key.replace('bookmark_', '');
      if (!id) {
        removed += 1;
        continue;
      }

      const manga = await AsyncStorage.getItem(`${MANGA_STORAGE_PREFIX}${id}`);
      if (manga) {
        kept.push(key);
      } else {
        removed += 1;
      }
    }

    if (removed > 0) {
      await AsyncStorage.setItem(BOOKMARK_KEYS_KEY, JSON.stringify(kept));
    }

    return removed;
  } catch (error) {
    logger().warn('Storage', 'Failed to prune stale bookmark index entries', {
      error: error instanceof Error ? error.message : String(error),
    });
    return 0;
  }
}

async function persistMangaDataRecord(data: MangaData): Promise<void> {
  await AsyncStorage.setItem(
    `${MANGA_STORAGE_PREFIX}${data.id}`,
    JSON.stringify(data)
  );
  const keys = await AsyncStorage.getItem(BOOKMARK_KEYS_KEY);
  const bookmarkKeys = keys ? JSON.parse(keys) : [];
  if (data.bookmarkStatus && !bookmarkKeys.includes(`bookmark_${data.id}`)) {
    bookmarkKeys.push(`bookmark_${data.id}`);
    await AsyncStorage.setItem(BOOKMARK_KEYS_KEY, JSON.stringify(bookmarkKeys));
  }
  await AsyncStorage.setItem(BOOKMARK_CHANGED_KEY, 'true');
}

export const setMangaData = async (data: MangaData): Promise<void> => {
  await enqueueMangaDataWrite(data.id, async () => {
    try {
      await persistMangaDataRecord(data);
    } catch (e) {
      console.error('Error saving manga data:', e);
    }
  });
};

export async function updateMangaData(
  id: string,
  updater: (
    existing: MangaData | null
  ) => MangaData | null | Promise<MangaData | null>
): Promise<MangaData | null> {
  return enqueueMangaDataWrite(id, async () => {
    const existing = await readMangaDataRecord(id);
    const next = await updater(existing);
    if (!next || next === existing) {
      return existing;
    }
    await persistMangaDataRecord(next);
    return next;
  });
}

export async function syncMangaDataHeader(
  mangaId: string,
  details: MangaDetails
): Promise<void> {
  try {
    if (!hasLoadedMangaHeader(details)) {
      return;
    }

    await enqueueMangaDataWrite(mangaId, async () => {
      const existing = await readMangaDataRecord(mangaId);
      if (!existing) {
        return;
      }

      const next = applyHeaderToMangaData(
        existing,
        extractMangaHeader(details, mangaId)
      );
      if (
        next.description === existing.description &&
        next.alternativeTitle === existing.alternativeTitle &&
        next.status === existing.status &&
        next.bannerImage === existing.bannerImage &&
        next.totalChapters === existing.totalChapters
      ) {
        return;
      }

      await persistMangaDataRecord(next);
    });
  } catch (error) {
    logger().warn(
      'Storage',
      'Failed to persist manga header onto bookmark data',
      {
        mangaId,
        error,
      }
    );
  }
}

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
    const existing = await getMangaData(id);
    const headerSnapshot = extractMangaHeader(
      {
        id,
        title: decode(mangaDetails?.title || existing?.title || ''),
        bannerImage: mangaDetails?.bannerImage || existing?.bannerImage || '',
        alternativeTitle: mangaDetails?.alternativeTitle ?? '',
        status: mangaDetails?.status ?? '',
        description: mangaDetails?.description ?? '',
        author: mangaDetails?.author ?? [],
        published: mangaDetails?.published ?? '',
        genres: mangaDetails?.genres ?? [],
        rating: mangaDetails?.rating ?? '',
        reviewCount: mangaDetails?.reviewCount ?? '',
        totalChapters:
          mangaDetails?.totalChapters ?? mangaDetails?.chapters?.length,
        type: mangaDetails?.type,
      },
      id
    );
    const mangaData = applyHeaderToMangaData(
      {
        ...(existing ?? {
          id,
          title: headerSnapshot.title,
          bannerImage: headerSnapshot.bannerImage,
          bookmarkStatus: status,
          readChapters,
          lastUpdated: Date.now(),
        }),
        id,
        title: headerSnapshot.title,
        bannerImage: headerSnapshot.bannerImage,
        bookmarkStatus: status,
        readChapters,
        lastUpdated: Date.now(),
        ...(typeof headerSnapshot.totalChapters === 'number'
          ? { totalChapters: headerSnapshot.totalChapters }
          : typeof existing?.totalChapters === 'number'
            ? { totalChapters: existing.totalChapters }
            : {}),
      },
      headerSnapshot
    );
    mangaData.bookmarkStatus = status;
    mangaData.readChapters = readChapters;

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
              // TODO: AniList sync disabled - re-enable when frontend integration is ready
              // await updateAniListStatusForBookmark(
              //   mangaDetails?.title,
              //   status,
              //   readChapters,
              //   mangaDetails?.chapters.length
              // );
            },
          },
          {
            text: 'Yes',
            onPress: async () => {
              await markAllChaptersAsRead(id, mangaDetails, setReadChapters);
              // TODO: AniList sync disabled - re-enable when frontend integration is ready
              // await updateAniListStatusForBookmark(
              //   mangaDetails?.title,
              //   status,
              //   readChapters,
              //   mangaDetails?.chapters.length
              // );
            },
          },
        ]
      );
    } else if (status !== 'On Hold') {
      // TODO: AniList sync disabled - re-enable when frontend integration is ready
      // await updateAniListStatusForBookmark(
      //   mangaDetails?.title,
      //   status,
      //   readChapters,
      //   mangaDetails?.chapters.length
      // );
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

    const keys = await AsyncStorage.getItem(BOOKMARK_KEYS_KEY);
    if (keys) {
      const bookmarkKeys = JSON.parse(keys);
      const updatedKeys = bookmarkKeys.filter(
        (key: string) => key !== `bookmark_${id}`
      );
      await AsyncStorage.setItem(
        BOOKMARK_KEYS_KEY,
        JSON.stringify(updatedKeys)
      );
    }

    // Update offline cache to mark as not bookmarked
    await offlineCacheService.updateMangaBookmarkStatus(id, false);

    setBookmarkStatus(null);
    setIsAlertVisible(false);
    await AsyncStorage.setItem(BOOKMARK_CHANGED_KEY, 'true');
  } catch (error) {
    console.error('Error removing bookmark:', error);
  }
};

export const replaceBookmark = async (
  sourceId: string,
  replacement: {
    id: string;
    title: string;
    bannerImage: string;
    totalChapters?: number;
  }
): Promise<MangaData> => {
  if (!sourceId || !replacement.id) {
    throw new Error('Both source and replacement manga IDs are required');
  }

  const log = logger();
  const normalizedSourceId = sourceId.trim();
  const normalizedTargetId = replacement.id.trim();

  const [sourceManga, targetManga, rawKeys] = await Promise.all([
    getMangaData(normalizedSourceId),
    getMangaData(normalizedTargetId),
    AsyncStorage.getItem(BOOKMARK_KEYS_KEY),
  ]);

  if (!sourceManga) {
    throw new Error('Original bookmark could not be found');
  }

  const mergedReadChapters = Array.from(
    new Set([
      ...(targetManga?.readChapters ?? []),
      ...(sourceManga.readChapters ?? []),
    ])
  );
  const nextLastReadChapter = resolveLastReadChapter(
    sourceManga.lastReadChapter,
    targetManga?.lastReadChapter,
    mergedReadChapters
  );
  const nextLastNotifiedChapter =
    sourceManga.lastNotifiedChapter ?? targetManga?.lastNotifiedChapter;
  const nextTotalChapters =
    replacement.totalChapters ??
    targetManga?.totalChapters ??
    sourceManga.totalChapters;

  const nextBookmark: MangaData = {
    ...targetManga,
    id: normalizedTargetId,
    title: replacement.title,
    bannerImage:
      replacement.bannerImage ||
      targetManga?.bannerImage ||
      sourceManga.bannerImage ||
      '',
    bookmarkStatus:
      sourceManga.bookmarkStatus ?? targetManga?.bookmarkStatus ?? null,
    readChapters: mergedReadChapters,
    lastUpdated: Date.now(),
    ...(nextLastReadChapter ? { lastReadChapter: nextLastReadChapter } : {}),
    ...(nextLastNotifiedChapter
      ? { lastNotifiedChapter: nextLastNotifiedChapter }
      : {}),
    ...(nextTotalChapters !== undefined
      ? { totalChapters: nextTotalChapters }
      : {}),
  };

  await AsyncStorage.setItem(
    `${MANGA_STORAGE_PREFIX}${normalizedTargetId}`,
    JSON.stringify(nextBookmark)
  );

  if (normalizedSourceId !== normalizedTargetId) {
    await AsyncStorage.removeItem(
      `${MANGA_STORAGE_PREFIX}${normalizedSourceId}`
    );
  }

  const existingKeys: string[] = rawKeys ? JSON.parse(rawKeys) : [];
  const updatedKeys = Array.from(
    new Set([
      ...existingKeys.filter((key) => key !== `bookmark_${normalizedSourceId}`),
      `bookmark_${normalizedTargetId}`,
    ])
  );

  await AsyncStorage.setItem(BOOKMARK_KEYS_KEY, JSON.stringify(updatedKeys));
  await AsyncStorage.setItem(BOOKMARK_CHANGED_KEY, 'true');

  try {
    if (normalizedSourceId !== normalizedTargetId) {
      await offlineCacheService.updateMangaBookmarkStatus(
        normalizedSourceId,
        false
      );
    }
    await offlineCacheService.updateMangaBookmarkStatus(
      normalizedTargetId,
      true
    );
  } catch (error) {
    log.warn(
      'Storage',
      'Failed to sync offline bookmark cache during replacement',
      {
        sourceId: normalizedSourceId,
        targetId: normalizedTargetId,
        error: error instanceof Error ? error.message : String(error),
      }
    );
  }

  return nextBookmark;
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
          onPress: () => { },
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
