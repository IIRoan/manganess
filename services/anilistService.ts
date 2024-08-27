// anilistService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getAuthData } from './anilistOAuth'; 

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
    const token = await AsyncStorage.getItem('anilistToken');
    return !!token; // Returns true if token exists, false otherwise
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