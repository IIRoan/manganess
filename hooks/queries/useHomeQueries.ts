import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { MANGA_API_URL } from '@/constants/Config';
import { parseMostViewedManga, parseNewReleases } from '@/services/mangaFireService';
import { getRecentlyReadManga } from '@/services/readChapterService';
import { queryKeys } from './queryKeys';
import type { MangaItem, MangaData } from '@/types';

interface HomeContent {
  mostViewed: MangaItem[];
  newReleases: MangaItem[];
  featured: MangaItem | null;
}

type CloudflareDetector = (html: string, currentRoute?: string) => boolean;

const HOME_REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
};

export const useHomeContent = (
  checkForCloudflare: CloudflareDetector
) =>
  useQuery<HomeContent, Error>({
    queryKey: queryKeys.home,
    queryFn: async () => {
      const response = await axios.get(`${MANGA_API_URL}/home`, {
        headers: HOME_REQUEST_HEADERS,
        timeout: 10000,
      });

      const html = response.data as string;

      if (checkForCloudflare(html, '/')) {
        throw new Error('cloudflare-detected');
      }

      const mostViewed = parseMostViewedManga(html);
      const newReleases = parseNewReleases(html);

      return {
        mostViewed,
        newReleases,
        featured: mostViewed[0] ?? null,
      };
    },
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 60,
    placeholderData: (previous) => previous,
    retry: (failureCount, error) => {
      if (error instanceof Error && error.message === 'cloudflare-detected') {
        return false;
      }
      return failureCount < 2;
    },
  });

export const useRecentlyReadQuery = (limit: number) =>
  useQuery<MangaData[]>({
    queryKey: queryKeys.recentlyRead.list(limit),
    queryFn: () => getRecentlyReadManga(limit),
    staleTime: 1000 * 30,
    placeholderData: (previous) => previous,
  });
