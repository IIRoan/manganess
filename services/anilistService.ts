import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthData } from './anilistOAuth';
import { decode } from 'html-entities';
import { getMangaData } from './bookmarkService';
import {
  saveMangaMapping as saveMapping,
  getAnilistIdFromInternalId as getMapping,
} from './mangaMappingService';

const ANILIST_API_URL = 'https://graphql.anilist.co';

interface AnilistManga {
  id: number;
  title: {
    romaji: string;
    english: string;
    native: string;
  };
}

export const isLoggedInToAniList = async (): Promise<boolean> => {
  try {
    const authData = await getAuthData();
    return !!authData && Date.now() < authData.expiresAt;
  } catch (error) {
    console.error('Error checking AniList login status:', error);
    return false;
  }
};

async function makeGraphQLRequest(
  query: string,
  variables: any,
  accessToken?: string
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const response = await fetch(ANILIST_API_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const data = await response.json();
  if (data.errors) {
    throw new Error(data.errors[0].message);
  }
  return data.data;
}

export async function searchAnilistMangaByName(
  name: string
): Promise<AnilistManga | null> {
  const query = `
    query ($search: String) {
      Media(search: $search, type: MANGA) {
        id
        title {
          romaji
          english
          native
        }
      }
    }
  `;

  const variables = { search: name };

  try {
    const data = await makeGraphQLRequest(query, variables);
    return data.Media || null;
  } catch (error) {
    console.error('Error searching AniList:', error);
    return null;
  }
}

export async function saveMangaMapping(
  internalId: string,
  anilistId: number,
  title: string
): Promise<void> {
  try {
    await saveMapping(internalId, anilistId, title);
  } catch (error) {
    console.error('Error saving manga mapping:', error);
  }
}

export async function getAnilistIdFromInternalId(
  internalId: string
): Promise<number | null> {
  try {
    return await getMapping(internalId);
  } catch (error) {
    console.error('Error getting AniList ID:', error);
    return null;
  }
}

export async function updateMangaStatus(
  mediaId: number,
  status: string,
  progress: number
): Promise<void> {
  const isLoggedIn = await isLoggedInToAniList();
  if (!isLoggedIn) {
    console.log('User is not logged in to AniList. Skipping update.');
    return;
  }
  const authData = await getAuthData();
  if (!authData) {
    throw new Error('User not authenticated with AniList');
  }

  const query = `
    mutation ($mediaId: Int, $status: MediaListStatus, $progress: Int) {
      SaveMediaListEntry (mediaId: $mediaId, status: $status, progress: $progress) {
        id
        status
        progress
      }
    }
  `;

  const variables = {
    mediaId,
    status,
    progress,
  };

  try {
    await makeGraphQLRequest(query, variables, authData.accessToken);
  } catch (error) {
    console.error('Error updating manga status on AniList:', error);
    throw error;
  }
}

export async function updateAniListStatus(
  mangaTitle: string,
  status: 'To Read' | 'Reading' | 'Read',
  readChapters: string[],
  totalChapters: number
): Promise<{ success: boolean; message: string }> {
  try {
    const isLoggedIn = await isLoggedInToAniList();
    if (!isLoggedIn) {
      console.log('User is not logged in to AniList. Skipping update.');
      return {
        success: false,
        message: `User is not logged in to AniList. Skipping update.`,
      };
    }

    const anilistManga = await searchAnilistMangaByName(mangaTitle);
    if (anilistManga) {
      let anilistStatus: string;
      let progress: number = 0;

      switch (status) {
        case 'To Read':
          anilistStatus = 'PLANNING';
          break;
        case 'Reading':
          anilistStatus = 'CURRENT';
          progress = readChapters.length;
          break;
        case 'Read':
          anilistStatus = 'COMPLETED';
          progress = totalChapters;
          break;
        default:
          anilistStatus = 'PLANNING';
      }

      await updateMangaStatus(anilistManga.id, anilistStatus, progress);
      console.log(
        `Updated AniList status for ${mangaTitle} to ${anilistStatus}`
      );
      return {
        success: true,
        message: `Updated AniList status for "${mangaTitle}" to ${status}`,
      };
    } else {
      console.log(`Manga ${mangaTitle} not found on AniList`);
      return {
        success: false,
        message: `"${mangaTitle}" was not found on AniList. Only local status was updated.`,
      };
    }
  } catch (error) {
    console.error('Error updating AniList status:', error);
    return {
      success: false,
      message: `Error updating AniList status: ${error}`,
    };
  }
}

export async function syncAllMangaWithAniList(): Promise<string[]> {
  const debug = (message: string, data?: any) => {
    console.log(`[Manga Sync] ${message}`, data || '');
  };

  try {
    debug('Starting manga sync');
    const isLoggedIn = await isLoggedInToAniList();
    if (!isLoggedIn) {
      throw new Error('User is not logged in to AniList');
    }

    const bookmarkKeysString = await AsyncStorage.getItem('bookmarkKeys');
    if (!bookmarkKeysString) {
      debug('No bookmarks found');
      return ['No bookmarked manga found'];
    }

    const bookmarkKeys = JSON.parse(bookmarkKeysString);
    const results: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const key of bookmarkKeys) {
      try {
        debug(`Processing manga key: ${key}`);
        const id = key.replace('bookmark_', '');

        // Get manga data from our structured storage
        const mangaData = await getMangaData(id);

        if (!mangaData?.title || !mangaData?.bookmarkStatus) {
          debug(`Missing data for manga ${id}`, {
            title: !!mangaData?.title,
            status: !!mangaData?.bookmarkStatus,
          });
          results.push(`Skipped manga with ID ${id}: Missing title or status`);
          failureCount++;
          continue;
        }

        const decodedTitle = decode(mangaData.title).trim();
        debug(`Searching for manga: ${decodedTitle}`);

        // Add retries for AniList search
        let anilistManga = null;
        let retries = 3;
        while (retries > 0 && !anilistManga) {
          try {
            anilistManga = await searchAnilistMangaByName(decodedTitle);
            if (!anilistManga && retries > 1) {
              debug(`Retry ${4 - retries} for ${decodedTitle}`);
              await new Promise((resolve) => setTimeout(resolve, 1000));
            }
          } catch (error) {
            debug(`Search error: ${error}`);
          }
          retries--;
        }

        if (!anilistManga) {
          debug(`Manga not found: ${decodedTitle}`);
          results.push(`Manga not found on AniList: ${decodedTitle}`);
          failureCount++;
          continue;
        }

        const anilistStatus =
          {
            'To Read': 'PLANNING',
            Reading: 'CURRENT',
            Read: 'COMPLETED',
            'On Hold': 'PAUSED',
          }[mangaData.bookmarkStatus] || 'PLANNING';

        const progress = mangaData.readChapters.length;

        debug(`Updating status for ${decodedTitle}`, {
          anilistStatus,
          progress,
        });
        await updateMangaStatus(anilistManga.id, anilistStatus, progress);

        // Save the mapping for future use
        await saveMangaMapping(id, anilistManga.id, decodedTitle);

        results.push(
          `Updated "${decodedTitle}" on AniList: Status=${anilistStatus}, Progress=${progress}`
        );
        successCount++;

        // Add delay between updates to prevent rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        debug(`Error processing manga: ${error}`);
        results.push(`Failed to update manga: ${error}`);
        failureCount++;
      }
    }

    debug('Sync completed', { success: successCount, failures: failureCount });
    results.unshift(
      `Sync completed: ${successCount} succeeded, ${failureCount} failed`
    );
    return results;
  } catch (error) {
    debug('Sync failed', error);
    throw error;
  }
}
