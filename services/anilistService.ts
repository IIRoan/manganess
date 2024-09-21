// anilistService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthData } from './anilistOAuth'; 
import { decode } from 'html-entities';
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

async function makeGraphQLRequest(query: string, variables: any, accessToken?: string) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
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

export async function searchAnilistMangaByName(name: string): Promise<AnilistManga | null> {
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

export async function saveMangaMapping(internalId: string, anilistId: number): Promise<void> {
  try {
    await AsyncStorage.setItem(`manga_mapping_${internalId}`, anilistId.toString());
  } catch (error) {
    console.error('Error saving manga mapping:', error);
  }
}

export async function getAnilistIdFromInternalId(internalId: string): Promise<number | null> {
  try {
    const anilistId = await AsyncStorage.getItem(`manga_mapping_${internalId}`);
    return anilistId ? parseInt(anilistId, 10) : null;
  } catch (error) {
    console.error('Error getting AniList ID:', error);
    return null;
  }
}

export async function updateMangaStatus(mediaId: number, status: string, progress: number): Promise<void> {
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
    progress
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
  status: "To Read" | "Reading" | "Read",
  readChapters: string[],
  totalChapters: number
): Promise<{ success: boolean; message: string }> {
  try {
    const isLoggedIn = await isLoggedInToAniList();
    if (!isLoggedIn) {
      console.log('User is not logged in to AniList. Skipping update.');
      return { success: false, message: 'User is not logged in to AniList' };
    }

    const anilistManga = await searchAnilistMangaByName(mangaTitle);
    if (anilistManga) {
      let anilistStatus: string;
      let progress: number = 0;

      switch (status) {
        case "To Read":
          anilistStatus = "PLANNING";
          break;
        case "Reading":
          anilistStatus = "CURRENT";
          progress = readChapters.length;
          break;
        case "Read":
          anilistStatus = "COMPLETED";
          progress = totalChapters;
          break;
        default:
          anilistStatus = "PLANNING";
      }

      await updateMangaStatus(anilistManga.id, anilistStatus, progress);
      console.log(`Updated AniList status for ${mangaTitle} to ${anilistStatus}`);
      return { 
        success: true, 
        message: `Updated AniList status for "${mangaTitle}" to ${status}` 
      };
    } else {
      console.log(`Manga ${mangaTitle} not found on AniList`);
      return { 
        success: false, 
        message: `"${mangaTitle}" was not found on AniList. Only local status was updated.` 
      };
    }
  } catch (error) {
    console.error('Error updating AniList status:', error);
    return { 
      success: false, 
      message: `Error updating AniList status: ${error}` 
    };
  }
}


// large syncAllMangaWithAniList function

export async function syncAllMangaWithAniList(): Promise<string[]> {
  const isLoggedIn = await isLoggedInToAniList();
  if (!isLoggedIn) {
    throw new Error('User is not logged in to AniList');
  }

  const bookmarkKeysString = await AsyncStorage.getItem('bookmarkKeys');
  if (!bookmarkKeysString) {
    return ['No bookmarked manga found'];
  }

  const bookmarkKeys = JSON.parse(bookmarkKeysString);
  const results: string[] = [];

  for (const key of bookmarkKeys) {
    const id = key.replace('bookmark_', '');
    const status = await AsyncStorage.getItem(key);
    const title = await AsyncStorage.getItem(`title_${id}`);
    const readChaptersString = await AsyncStorage.getItem(`manga_${id}_read_chapters`);

    if (!title || !status) {
      results.push(`Skipped manga with ID ${id}: Missing title or status`);
      continue;
    }

    const decodedTitle = decode(title);
    const anilistManga = await searchAnilistMangaByName(decodedTitle);

    if (!anilistManga) {
      results.push(`Manga not found on AniList: ${decodedTitle}`);
      continue;
    }

    let anilistStatus: string;
    switch (status) {
      case 'To Read':
        anilistStatus = 'PLANNING';
        break;
      case 'Reading':
        anilistStatus = 'CURRENT';
        break;
      case 'Read':
        anilistStatus = 'COMPLETED';
        break;
      default:
        anilistStatus = 'PLANNING';
    }

    const readChapters = readChaptersString ? JSON.parse(readChaptersString) : [];
    const progress = readChapters.length;

    try {
      await updateMangaStatus(anilistManga.id, anilistStatus, progress);
      results.push(`Updated "${decodedTitle}" on AniList: Status=${anilistStatus}, Progress=${progress}`);
    } catch (error) {
      results.push(`Failed to update "${decodedTitle}" on AniList: ${error}`);
    }
  }

  return results;
}