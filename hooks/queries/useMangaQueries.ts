import { useQuery, type UseQueryOptions } from '@tanstack/react-query';

import { queryKeys } from './queryKeys';
import {
  genreMangaQueryOptions,
  mangaDetailsQueryOptions,
  searchMangaQueryOptions,
  type MangaDetails,
  type MangaItem,
} from '@/services/mangaFireService';

type QueryOptions<TData, TQueryKey extends readonly unknown[]> = Omit<
  UseQueryOptions<TData, Error, TData, TQueryKey>,
  'queryKey' | 'queryFn'
>;

export const useMangaDetailsQuery = (
  id: string | undefined,
  options?: QueryOptions<MangaDetails, ReturnType<typeof queryKeys.manga.details>>
) => {
  const normalizedId = id?.trim();
  const { enabled, ...restOptions } = options ?? {};

  const baseOptions = mangaDetailsQueryOptions(normalizedId ?? '');

  return useQuery<MangaDetails, Error, MangaDetails, ReturnType<typeof queryKeys.manga.details>>({
    ...baseOptions,
    enabled: Boolean(normalizedId) && (enabled ?? true),
    ...restOptions,
  });
};

export const useSearchMangaQuery = (
  query: string,
  options?: QueryOptions<MangaItem[], ReturnType<typeof queryKeys.search>>
) => {
  const normalizedQuery = query.trim();
  const { enabled, ...restOptions } = options ?? {};

  const baseOptions = searchMangaQueryOptions(normalizedQuery);

  return useQuery<MangaItem[], Error, MangaItem[], ReturnType<typeof queryKeys.search>>({
    ...baseOptions,
    enabled: normalizedQuery.length > 2 && (enabled ?? true),
    ...restOptions,
  });
};

export const useGenreMangaQuery = (
  slug: string | null,
  options?: QueryOptions<MangaItem[], ReturnType<typeof queryKeys.genres>>
) => {
  const normalizedSlug = slug?.trim() ?? '';
  const { enabled, ...restOptions } = options ?? {};

  const baseOptions = genreMangaQueryOptions(normalizedSlug);

  return useQuery<MangaItem[], Error, MangaItem[], ReturnType<typeof queryKeys.genres>>({
    ...baseOptions,
    enabled: Boolean(normalizedSlug) && (enabled ?? true),
    ...restOptions,
  });
};



