import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'html-entities';
import type { EnsureQueryDataOptions } from '@tanstack/react-query';
import { getAuthData } from './anilistOAuth';
import { getMangaData } from './bookmarkService';
import {
  saveMangaMapping as saveMapping,
  getAnilistIdFromInternalId as getMapping,
} from './mangaMappingService';
import { queryClient } from '@/utils/queryClient';
import { queryKeys } from '@/hooks/queries/queryKeys';
import type { AnilistManga } from '@/types';

const ANILIST_API_URL = 'https://graphql.anilist.co';
const ANILIST_SEARCH_QUERY = `
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

interface GraphQLResponse<TData> {
  data?: TData;
  errors?: { message: string }[];
}

type AniListSearchQueryKey = ReturnType<typeof queryKeys.anilist.search>;

type AniListSearchQueryOptions = EnsureQueryDataOptions<
  AnilistManga | null,
  Error,
  AnilistManga | null,
  AniListSearchQueryKey
>;

const STALE_TIME_ONE_HOUR = 1000 * 60 * 60;
const GC_TIME_ONE_DAY = 1000 * 60 * 60 * 24;

export const isLoggedInToAniList = async (): Promise<boolean> => {
  try {
    const authData = await getAuthData();
    return !!authData && Date.now() < authData.expiresAt;
  } catch (error) {
    console.error('Error checking AniList login status:', error);
    return false;
  }
};

const createAniListSearchQueryOptions = (
  rawName: string
): AniListSearchQueryOptions => {
  const normalizedName = rawName.trim();

  return {
    queryKey: queryKeys.anilist.search(normalizedName),
    queryFn: async () => {
      if (!normalizedName) {
        throw new Error('Search term is required');
      }

      const data = await makeGraphQLRequest<{
        Media: AnilistManga | null;
      }>(ANILIST_SEARCH_QUERY, {
        search: normalizedName,
      });

      return data.Media ?? null;
    },
    staleTime: STALE_TIME_ONE_HOUR,
    gcTime: GC_TIME_ONE_DAY,
  } satisfies AniListSearchQueryOptions;
};

export const anilistSearchQueryOptions = (
  name: string
): AniListSearchQueryOptions => createAniListSearchQueryOptions(name);

async function makeGraphQLRequest<TData>(
  query: string,
  variables: Record<string, unknown>,
  accessToken?: string
): Promise<TData> {
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

  const data = (await response.json()) as GraphQLResponse<TData>;

  if (data.errors?.length) {
    throw new Error(data.errors[0]?.message ?? 'Unknown AniList error');
  }

  if (!data.data) {
    throw new Error('No data returned from AniList');
  }

  return data.data;
}

export async function searchAnilistMangaByName(
  name: string
): Promise<AnilistManga | null> {
  const normalizedName = name.trim();

  if (!normalizedName) {
    return null;
  }

  try {
    return await queryClient.ensureQueryData(
      anilistSearchQueryOptions(normalizedName)
    );
  } catch (error) {
    console.error('Error searching AniList:', error);
    queryClient.removeQueries({
      queryKey: queryKeys.anilist.search(normalizedName),
    });
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
