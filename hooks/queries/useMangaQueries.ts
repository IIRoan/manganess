import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

import { queryKeys } from './queryKeys';
import {
  fetchGenreManga,
  fetchMangaDetails,
  searchManga,
  type MangaDetails,
  type MangaItem,
} from '@/services/mangaFireService';

const STALE_TIME_SIX_HOURS = 1000 * 60 * 60 * 6;
const GC_TIME_ONE_DAY = 1000 * 60 * 60 * 24;

type QueryOptions<TData, TQueryKey extends readonly unknown[]> = Omit<
  UseQueryOptions<TData, Error, TData, TQueryKey>,
  'queryKey' | 'queryFn'
>;

export const useMangaDetailsQuery = (
  id: string | undefined,
  options?: QueryOptions<
    MangaDetails,
    ReturnType<typeof queryKeys.manga.details>
  >
) => {
  const normalizedId = id?.trim();
  const { enabled, ...restOptions } = options ?? {};

  return useQuery<
    MangaDetails,
    Error,
    MangaDetails,
    ReturnType<typeof queryKeys.manga.details>
  >({
    queryKey: queryKeys.manga.details(normalizedId ?? ''),
    queryFn: () => {
      if (!normalizedId) {
        throw new Error('Manga id is required');
      }
      return fetchMangaDetails(normalizedId);
    },
    enabled: Boolean(normalizedId) && (enabled ?? true),
    staleTime: STALE_TIME_SIX_HOURS,
    gcTime: GC_TIME_ONE_DAY,
    ...restOptions,
  });
};

export const useSearchMangaQuery = (
  query: string,
  options?: QueryOptions<MangaItem[], ReturnType<typeof queryKeys.search>>
) => {
  const normalizedQuery = query.trim();
  const { enabled, ...restOptions } = options ?? {};

  return useQuery<
    MangaItem[],
    Error,
    MangaItem[],
    ReturnType<typeof queryKeys.search>
  >({
    queryKey: queryKeys.search(normalizedQuery),
    queryFn: () => {
      if (normalizedQuery.length <= 2) {
        throw new Error('Search query must be at least 3 characters');
      }
      return searchManga(normalizedQuery);
    },
    enabled: normalizedQuery.length > 2 && (enabled ?? true),
    placeholderData: (previous) => previous ?? ([] as MangaItem[]),
    staleTime: 1000 * 60,
    gcTime: GC_TIME_ONE_DAY,
    ...restOptions,
  });
};

export const useGenreMangaQuery = (
  slug: string | null,
  options?: QueryOptions<MangaItem[], ReturnType<typeof queryKeys.genres>>
) => {
  const normalizedSlug = slug?.trim() ?? '';
  const { enabled, ...restOptions } = options ?? {};

  return useQuery<
    MangaItem[],
    Error,
    MangaItem[],
    ReturnType<typeof queryKeys.genres>
  >({
    queryKey: queryKeys.genres(normalizedSlug),
    queryFn: () => {
      if (!normalizedSlug) {
        throw new Error('Genre slug is required');
      }
      return fetchGenreManga(normalizedSlug);
    },
    enabled: Boolean(normalizedSlug) && (enabled ?? true),
    placeholderData: (previous) => previous ?? ([] as MangaItem[]),
    staleTime: 1000 * 60,
    gcTime: GC_TIME_ONE_DAY,
    ...restOptions,
  });
};
