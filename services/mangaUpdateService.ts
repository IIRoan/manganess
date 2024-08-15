// mangaUpdateService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchMangaDetails } from './mangaFireService';
import * as Notifications from 'expo-notifications';

interface Bookmark {
  id: string;
  title: string;
  status: 'Reading' | 'To Read' | 'Read';
  lastReadChapter: string;
  imageUrl: string;
}

let updateInterval: NodeJS.Timeout | null = null;

export const isNotificationsEnabled = async (): Promise<boolean> => {
  const state = await AsyncStorage.getItem('notificationsEnabled');
  return state !== 'false';
};

const getBookmarks = async (): Promise<Bookmark[]> => {
  try {
    const keys = await AsyncStorage.getItem('bookmarkKeys');
    const bookmarkKeys = keys ? JSON.parse(keys) : [];
    const bookmarkPromises = bookmarkKeys.map(async (key: string) => {
      const status = await AsyncStorage.getItem(key);
      const id = key.split('_')[1];
      const title = await AsyncStorage.getItem(`title_${id}`);
      const lastReadChapter = await AsyncStorage.getItem(`manga_${id}_read_chapters`);
      const imageUrl = await AsyncStorage.getItem(`image_${id}`);
      return { id, title, status, lastReadChapter, imageUrl };
    });
    const bookmarks = await Promise.all(bookmarkPromises);
    return bookmarks.filter((item): item is Bookmark => 
      item.title !== null && item.imageUrl !== null && item.status === 'Reading'
    );
  } catch (error) {
    console.error('Error fetching bookmarks:', error);
    return [];
  }
}

const checkForUpdates = async () => {
    try {
      if (!(await isNotificationsEnabled())) {
        console.log('[DEBUG] Notifications are disabled. Skipping update check.');
        return;
      }
  
      console.log('[DEBUG] Checking for updates');
      const readingManga = await getBookmarks();
      console.log(`[DEBUG] Found ${readingManga.length} manga in 'Reading' status`);
      let newChapters: { mangaId: string, title: string, chapterNumber: string }[] = [];
  
      for (const manga of readingManga) {
        const mangaDetails = await fetchMangaDetails(manga.id);
        const lastKnownChapter = manga.lastReadChapter ? JSON.parse(manga.lastReadChapter).pop() : null;
        
        if (lastKnownChapter && mangaDetails.chapters.length > 0) {
          const newestChapter = mangaDetails.chapters[0].number;
          if (newestChapter !== lastKnownChapter) {
            const lastNotifiedChapter = await AsyncStorage.getItem(`last_notified_chapter_${manga.id}`);
            if (newestChapter !== lastNotifiedChapter) {
              newChapters.push({ mangaId: manga.id, title: manga.title, chapterNumber: newestChapter });
              await AsyncStorage.setItem(`last_notified_chapter_${manga.id}`, newestChapter);
            }
          }
        } else if (mangaDetails.chapters.length > 0) {
          await AsyncStorage.setItem(`manga_${manga.id}_read_chapters`, JSON.stringify([mangaDetails.chapters[0].number]));
        }
      }
  
      if (newChapters.length > 0) {
        console.log('[DEBUG] New chapters found!');
        await sendPushNotifications(newChapters);
      } else {
        console.log('[DEBUG] No new chapters found');
      }
    } catch (error) {
      console.error('[DEBUG] Error checking for manga updates:', error);
    }
  };

const sendPushNotifications = async (newChapters: { mangaId: string, title: string, chapterNumber: string }[]) => {
    if (!(await isNotificationsEnabled())) {
      console.log('[DEBUG] Notifications are disabled. Skipping push notifications.');
      return;
    }
  
    for (const chapter of newChapters) {
      const notificationContent = {
        title: 'New Chapter Available!',
        body: `${chapter.title} Chapter ${chapter.chapterNumber} is now available!`,
        data: { mangaId: chapter.mangaId },
      };
  
      console.log('[DEBUG] Sending push notification:', notificationContent);
  
      try {
        const notificationId = await Notifications.scheduleNotificationAsync({
          content: notificationContent,
          trigger: null,
        });
        console.log(`[DEBUG] Push notification sent successfully. ID: ${notificationId}`);
      } catch (error) {
        console.error('[DEBUG] Error sending push notification:', error);
      }
    }
  };

export const startUpdateService = () => {
  if (updateInterval) {
    console.log('[DEBUG] Update service is already running');
    return;
  }
  updateInterval = setInterval(checkForUpdates, 24 * 60 * 60 * 1000); // 24 hours
  console.log('[DEBUG] Update service started');
}

export const stopUpdateService = () => {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
    console.log('[DEBUG] Update service stopped');
  } else {
    console.log('[DEBUG] Update service is not running');
  }
}

export const checkForUpdatesManually = async () => {
  console.log('[DEBUG] Manually checking for updates');
  await checkForUpdates();
}

export const simulateNewChapterRelease = async (mangaId: string, newChapterNumber: string) => {
  try {
    console.log(`[DEBUG] Simulating new chapter ${newChapterNumber} for manga ${mangaId}`);
    
    const title = await AsyncStorage.getItem(`title_${mangaId}`);
    if (!title) {
      console.error(`[DEBUG] Manga with id ${mangaId} not found`);
      return;
    }

    const lastKnownChapters = JSON.parse(await AsyncStorage.getItem(`manga_${mangaId}_read_chapters`) || '[]');
    lastKnownChapters.push(newChapterNumber);
    await AsyncStorage.setItem(`manga_${mangaId}_read_chapters`, JSON.stringify(lastKnownChapters));

    const lastNotifiedChapter = await AsyncStorage.getItem(`last_notified_chapter_${mangaId}`);
    if (newChapterNumber !== lastNotifiedChapter) {
      await sendPushNotifications([{ mangaId, title, chapterNumber: newChapterNumber }]);
      await AsyncStorage.setItem(`last_notified_chapter_${mangaId}`, newChapterNumber);
      console.log(`[DEBUG] Simulated push notification for ${title} Chapter ${newChapterNumber}`);
    } else {
      console.log(`[DEBUG] Chapter ${newChapterNumber} has already been notified`);
    }

    await logDebugState();
  } catch (error) {
    console.error('[DEBUG] Error simulating new chapter release:', error);
  }
}

export const logDebugState = async () => {
  const readingManga = await getBookmarks();
  console.log('[DEBUG] Current state:');
  console.log(`Reading manga count: ${readingManga.length}`);
  for (const manga of readingManga) {
    const lastKnownChapters = JSON.parse(await AsyncStorage.getItem(`manga_${manga.id}_read_chapters`) || '[]');
    const lastKnownChapter = lastKnownChapters.length > 0 ? lastKnownChapters[lastKnownChapters.length - 1] : null;
    const lastNotifiedChapter = await AsyncStorage.getItem(`last_notified_chapter_${manga.id}`);
    console.log(`Manga: ${manga.title}`);
    console.log(`  ID: ${manga.id}`);
    console.log(`  Last known chapter: ${lastKnownChapter}`);
    console.log(`  Last notified chapter: ${lastNotifiedChapter}`);
    console.log(`  All known chapters: ${lastKnownChapters.join(', ')}`);
  }
}
