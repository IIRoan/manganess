import axios, { type AxiosRequestConfig } from 'axios';
import { MANGA_API_URL } from '@/constants/Config';
import { logger } from '@/utils/logger';
import {
  getErrorMessage,
  isForbiddenError,
  isRateLimitError,
  summarizeApiError,
  withApiRetry,
} from '@/utils/httpErrors';
import { stripHtmlToText } from '@/utils/stripHtmlToText';
import {
  invalidateMangaFireRequestCache,
  peekFreshCache,
  REQUEST_HUB_TTLS,
  scheduleMangaFireRequest,
  withMangaFireRateLimit,
} from '@/services/mangaFireRequestHub';
import {
  appendVrfParams,
  logVrfFailure,
  mangaFireVrfBridge,
  shouldProxyMangaFireApi,
} from '@/services/mangaFireVrfBridge';
import type { MangaItem } from '@/types/manga';
import type { Chapter, MangaDetails } from '@/types/manga';
import {
  dedupeChaptersPreferringOfficial,
  resolveReportedChapterTotal,
} from '@/utils/chapterListDedupe';

function normalizeChapterNumber(value: string | null | undefined): string {
  if (!value) return '';
  let normalized = String(value).trim();
  if (!normalized) return '';
  normalized = normalized
    .replace(/^chapter/i, '')
    .replace(/\s+/g, '')
    .replace(/_/g, '.')
    .replace(/(\d)-(?=\d)/g, '$1.')
    .replace(/-+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/[^0-9a-zA-Z.\-]/g, '');
  return normalized.replace(/^[.-]+/, '').replace(/[.-]+$/, '');
}

const API_BASE = `${MANGA_API_URL}/api`;

const DEFAULT_HEADERS = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  Referer: MANGA_API_URL,
  'X-Requested-With': 'XMLHttpRequest',
};

export interface ApiPoster {
  small?: string;
  medium?: string;
  large?: string;
}

export interface ApiTitleSummary {
  id: number;
  hid: string;
  slug: string;
  title: string;
  type: string;
  status?: string;
  poster?: ApiPoster;
  latestChapter?: number;
  year?: number;
  rank?: number;
  chapterUpdatedAt?: string;
  url?: string;
}

export interface ApiTitleDetails extends ApiTitleSummary {
  synopsisHtml?: string;
  altTitles?: string[];
  rating?: number | string;
  ratingCount?: number | string;
  follows?: number;
  languages?: string[];
  genres?: Array<
    { id?: number; name?: string; title?: string; slug?: string } | string
  >;
  themes?: Array<
    { id?: number; name?: string; title?: string; slug?: string } | string
  >;
  demographics?: Array<
    { id?: number; name?: string; title?: string; slug?: string } | string
  >;
  authors?: Array<{ id?: number; name?: string; title?: string } | string>;
  artists?: Array<{ id?: number; name?: string; title?: string } | string>;
  contentRating?: string;
}

export interface ApiChapterSummary {
  id: number;
  number: number | string;
  name?: string;
  language?: string;
  type?: string;
  createdAt?: number;
}

export interface ApiPaginated<T> {
  items: T[];
  meta?: {
    total?: number;
    perPage?: number;
    page?: number;
    lastPage?: number;
    hasNext?: boolean;
  };
}

export interface ApiChapterPage {
  url: string;
  width?: number;
  height?: number;
}

async function apiRequest<T>(
  path: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
  requestOptions: { retry?: boolean } = {}
): Promise<{ status: number; data: T }> {
  const log = logger();
  const validateStatus = config?.validateStatus;
  const operation = async () =>
    withMangaFireRateLimit(async () => {
      if (shouldProxyMangaFireApi()) {
        return mangaFireVrfBridge.fetchJson<T>(path, params, {
          ...(validateStatus ? { validateStatus } : {}),
        });
      }

      let requestParams: Record<string, unknown> | undefined;
      try {
        // Fresh VRF on every attempt — stale tokens commonly cause 403s
        requestParams = await appendVrfParams(path, params);
      } catch (error) {
        logVrfFailure(path, error);
        throw error;
      }

      const response = await axios.get<T>(`${API_BASE}${path}`, {
        headers: DEFAULT_HEADERS,
        timeout: 20000,
        params: requestParams,
        ...config,
      });
      return { status: response.status, data: response.data };
    });

  if (requestOptions.retry === false) {
    return operation();
  }

  return withApiRetry(operation, {
    onRetry: ({ attempt, delayMs, error }) => {
      log.warn('Network', 'MangaFire API retry scheduled', {
        path,
        attempt,
        delayMs,
        forbidden: isForbiddenError(error),
        rateLimited: isRateLimitError(error),
        ...summarizeApiError(error),
      });
    },
  });
}

async function apiGet<T>(
  path: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig,
  requestOptions?: { retry?: boolean }
): Promise<T> {
  const { data } = await apiRequest<T>(path, params, config, requestOptions);
  return data;
}

function mapNames(
  values?: Array<{ name?: string; title?: string } | string>
): string[] {
  if (!values?.length) return [];
  return values
    .map((value) =>
      typeof value === 'string' ? value : value.name || value.title || ''
    )
    .filter(Boolean);
}

/** @deprecated No longer probes official-only lists. */
export const PREFERRED_CHAPTER_LIST_TYPE = 'official';

export function resetMangaFireChapterTypeCacheForTests(): void {
  // Kept for test compatibility.
}

export function mapApiTitleToMangaItem(
  item: ApiTitleSummary,
  rank?: number
): MangaItem {
  const poster =
    item.poster?.medium || item.poster?.large || item.poster?.small || '';
  const relativeUrl =
    item.url || `/title/${item.hid}${item.slug ? `-${item.slug}` : ''}`;
  const mapped: MangaItem = {
    id: item.hid,
    title: item.title,
    banner: item.poster?.large || poster,
    imageUrl: poster,
    link: relativeUrl.startsWith('http')
      ? relativeUrl
      : `${MANGA_API_URL}${relativeUrl}`,
    type: item.type,
  };
  const resolvedRank = rank ?? item.rank;
  if (resolvedRank != null) {
    mapped.rank = resolvedRank;
  }
  return mapped;
}

export async function fetchTrendingTitles(
  days = 7,
  limit = 30
): Promise<MangaItem[]> {
  const data = await apiGet<{ items: ApiTitleSummary[] }>('/top-titles', {
    type: 'trending',
    days,
    limit,
  });
  return (data.items || []).map((item, index) =>
    mapApiTitleToMangaItem(item, index + 1)
  );
}

export async function fetchLatestTitles(limit = 30): Promise<MangaItem[]> {
  const data = await apiGet<{ items: ApiTitleSummary[] }>('/top-titles', {
    'order[chapter_updated_at]': 'desc',
    limit,
  });
  return (data.items || []).map((item) => mapApiTitleToMangaItem(item));
}

export async function searchTitles(
  keyword: string,
  limit = 40
): Promise<MangaItem[]> {
  const normalizedKeyword = keyword.trim().toLowerCase();
  return scheduleMangaFireRequest(
    `search:${normalizedKeyword}:${limit}`,
    async () => {
      const data = await apiGet<ApiPaginated<ApiTitleSummary>>('/titles', {
        keyword: keyword.trim(),
        limit,
      });
      return (data.items || []).map((item) => mapApiTitleToMangaItem(item));
    },
    { ttlMs: REQUEST_HUB_TTLS.search }
  );
}

export async function fetchTitlesByGenre(
  genreSlug: string,
  limit = 40
): Promise<MangaItem[]> {
  return scheduleMangaFireRequest(
    `genre:${genreSlug}:${limit}`,
    async () => {
      const data = await apiGet<ApiPaginated<ApiTitleSummary>>('/titles', {
        genres: [genreSlug],
        limit,
      });
      return (data.items || []).map((item) => mapApiTitleToMangaItem(item));
    },
    { ttlMs: REQUEST_HUB_TTLS.genre }
  );
}

export function titleDetailsCacheKey(
  hid: string,
  options: { retry?: boolean } = {}
): string {
  const normalizedHid = hid.trim();
  return options.retry === false
    ? `title:${normalizedHid}:no-retry`
    : `title:${normalizedHid}`;
}

export function titleChaptersCacheKey(hid: string, language = 'en'): string {
  return `chapters:${hid.trim()}:${language}:all`;
}

export async function fetchTitleDetails(
  hid: string,
  options: { retry?: boolean } = {}
): Promise<ApiTitleDetails> {
  const normalizedHid = hid.trim();
  const log = logger();
  log.info('Service', 'fetchTitleDetails:start', { id: normalizedHid });
  try {
    const title = await scheduleMangaFireRequest(
      titleDetailsCacheKey(normalizedHid, options),
      async () => {
        const data = await apiGet<{ data: ApiTitleDetails }>(
          `/titles/${normalizedHid}`,
          undefined,
          undefined,
          options
        );
        return data.data;
      },
      { ttlMs: REQUEST_HUB_TTLS.mangaDetails }
    );
    log.info('Service', 'fetchTitleDetails:done', {
      id: normalizedHid,
      hasSynopsis: Boolean(title.synopsisHtml?.trim()),
      synopsisLength: title.synopsisHtml?.trim().length ?? 0,
      authorCount: Array.isArray(title.authors) ? title.authors.length : 0,
      genreCount: Array.isArray(title.genres) ? title.genres.length : 0,
    });
    return title;
  } catch (error) {
    log.warn('Service', 'fetchTitleDetails:failed', {
      id: normalizedHid,
      ...summarizeApiError(error),
    });
    throw error;
  }
}

export async function fetchTitleDetailsIfExists(
  hid: string
): Promise<ApiTitleDetails | null> {
  const normalizedHid = hid.trim();
  return scheduleMangaFireRequest(
    `title-exists:${normalizedHid}`,
    async () => {
      try {
        const path = `/titles/${normalizedHid}`;
        const response = await apiRequest<{ data: ApiTitleDetails }>(
          path,
          undefined,
          {
            validateStatus: (status) => status === 200 || status === 404,
          }
        );

        if (response.status === 404) {
          return null;
        }

        return response.data.data;
      } catch (error: any) {
        if (error?.response?.status === 404) {
          return null;
        }
        throw error;
      }
    },
    { ttlMs: REQUEST_HUB_TTLS.titleMeta }
  );
}

async function fetchTitleChaptersPage(
  hid: string,
  page: number,
  language = 'en'
): Promise<ApiPaginated<ApiChapterSummary>> {
  return apiGet<ApiPaginated<ApiChapterSummary>>(
    `/titles/${hid.trim()}/chapters`,
    {
      language,
      page,
    }
  );
}

function shouldContinueChapterPagination(
  page: number,
  data: ApiPaginated<ApiChapterSummary>
): boolean {
  const items = data.items || [];
  const emptyPage = items.length === 0;
  if (emptyPage || !data.meta) {
    return false;
  }

  const lastPage = data.meta.lastPage;
  if (typeof lastPage === 'number' && lastPage > 0) {
    return page < lastPage;
  }

  const total = data.meta.total;
  const perPage = data.meta.perPage;
  if (
    typeof total === 'number' &&
    total > 0 &&
    typeof perPage === 'number' &&
    perPage > 0
  ) {
    return page * perPage < total;
  }

  return data.meta.hasNext === true;
}

export interface FetchTitleChaptersOptions {
  language?: string;
  /** Stop after this many pages (1 = first page only). */
  maxPages?: number;
  /** Return true to stop pagination early (e.g. screen unmounted). */
  shouldCancel?: () => boolean;
  /** Called after each page so UIs can render before the full list is ready. */
  onPage?: (
    chaptersSoFar: ApiChapterSummary[],
    meta: {
      page: number;
      hasMore: boolean;
      lastPage?: number;
      total?: number;
    }
  ) => void;
}

async function fetchTitleChaptersUncached(
  hid: string,
  options: FetchTitleChaptersOptions = {}
): Promise<ApiChapterSummary[]> {
  const language = options.language ?? 'en';
  const chapters: ApiChapterSummary[] = [];
  let page = 1;
  let apiHasMore = true;
  const hardCap = 200;
  const maxPages =
    typeof options.maxPages === 'number' && options.maxPages > 0
      ? Math.min(options.maxPages, hardCap)
      : hardCap;

  while (apiHasMore && page <= maxPages) {
    if (options.shouldCancel?.()) {
      logger().info('Service', 'Chapter pagination cancelled', {
        hid,
        page,
        chapterCount: chapters.length,
      });
      break;
    }

    const data = await fetchTitleChaptersPage(hid, page, language);
    chapters.push(...(data.items || []));
    const visible = dedupeChaptersPreferringOfficial(chapters);

    apiHasMore = shouldContinueChapterPagination(page, data);
    const reportedTotal = resolveReportedChapterTotal({
      rawCount: chapters.length,
      uniqueCount: visible.length,
      ...(typeof data.meta?.total === 'number'
        ? { apiTotal: data.meta.total }
        : {}),
      hasMore: apiHasMore,
    });
    options.onPage?.(visible, {
      page,
      hasMore: apiHasMore,
      ...(typeof data.meta?.lastPage === 'number'
        ? { lastPage: data.meta.lastPage }
        : {}),
      ...(typeof reportedTotal === 'number' ? { total: reportedTotal } : {}),
    });
    page += 1;

    if (!data.meta) {
      break;
    }
  }

  return dedupeChaptersPreferringOfficial(chapters);
}

export async function fetchTitleChapters(
  hid: string,
  languageOrOptions: string | FetchTitleChaptersOptions = 'en'
): Promise<ApiChapterSummary[]> {
  const normalizedHid = hid.trim();
  const options: FetchTitleChaptersOptions =
    typeof languageOrOptions === 'string'
      ? { language: languageOrOptions }
      : languageOrOptions;
  const language = options.language ?? 'en';

  // Limited / cancellable / progressive loads bypass the shared cache entry.
  if (options.shouldCancel || options.onPage || options.maxPages) {
    return fetchTitleChaptersUncached(normalizedHid, options);
  }

  return scheduleMangaFireRequest(
    titleChaptersCacheKey(normalizedHid, language),
    () => fetchTitleChaptersUncached(normalizedHid, { language }),
    { ttlMs: REQUEST_HUB_TTLS.chapters }
  );
}

/** Fetch a single chapter list page, mapped for the UI. */
export async function fetchMappedTitleChaptersPage(
  hid: string,
  page: number,
  language = 'en'
): Promise<{
  chapters: Chapter[];
  hasMore: boolean;
  page: number;
  lastPage?: number;
  total?: number;
}> {
  const data = await fetchTitleChaptersPage(hid.trim(), page, language);
  const items = dedupeChaptersPreferringOfficial(data.items || []);
  const lastPage = data.meta?.lastPage;
  const hasMore = shouldContinueChapterPagination(page, data);
  const total = resolveReportedChapterTotal({
    rawCount: (data.items || []).length,
    uniqueCount: items.length,
    ...(typeof data.meta?.total === 'number'
      ? { apiTotal: data.meta.total }
      : {}),
    hasMore,
  });
  return {
    chapters: mapApiChapters(items),
    hasMore,
    page,
    ...(typeof lastPage === 'number' ? { lastPage } : {}),
    ...(typeof total === 'number' ? { total } : {}),
  };
}

export function mapApiChapters(chapters: ApiChapterSummary[]): Chapter[] {
  return chapters
    .map((chapter) => {
      const number = normalizeChapterNumber(String(chapter.number));
      const name = chapter.name?.trim();
      const sourceType = chapter.type?.trim();
      return {
        number,
        title: name ? `Chapter ${number}: ${name}` : `Chapter ${number}`,
        date: chapter.createdAt
          ? new Date(chapter.createdAt * 1000).toLocaleDateString()
          : '',
        url: `/chapter/${chapter.id}`,
        ...(sourceType ? { sourceType } : {}),
      };
    })
    .filter((chapter) => chapter.number && chapter.url);
}

export function mapApiTitleToMangaDetails(
  title: ApiTitleDetails,
  chapters: ApiChapterSummary[],
  options?: { totalChapters?: number }
): MangaDetails {
  const poster =
    title.poster?.large || title.poster?.medium || title.poster?.small || '';

  const mappedChapters = mapApiChapters(chapters);
  // Never invent totalChapters from a partial page length — that made page-1
  // windows (40–90) look "complete" via count >= total.
  const reportedTotal =
    typeof options?.totalChapters === 'number' && options.totalChapters > 0
      ? options.totalChapters
      : undefined;

  return {
    id: title.hid,
    title: title.title,
    alternativeTitle: (title.altTitles || []).join(', '),
    status: title.status || 'unknown',
    description: title.synopsisHtml
      ? stripHtmlToText(title.synopsisHtml)
      : 'No description available',
    author: mapNames(title.authors),
    published: title.year ? String(title.year) : 'Unknown',
    genres: mapNames(title.genres),
    rating: title.rating != null ? String(title.rating) : 'N/A',
    reviewCount: title.ratingCount != null ? String(title.ratingCount) : '0',
    bannerImage: poster,
    chapters: mappedChapters,
    ...(typeof reportedTotal === 'number' ? { totalChapters: reportedTotal } : {}),
    type: title.type,
  };
}

export interface HomeMangaData {
  mostViewed: MangaItem[];
  newReleases: MangaItem[];
  featuredManga: MangaItem | null;
  /** True when one section failed but the other returned data. */
  partialFailure: boolean;
}

function settledValues(
  label: string,
  result: PromiseSettledResult<MangaItem[]>
): { items: MangaItem[]; error: unknown } {
  if (result.status === 'fulfilled') {
    return { items: result.value, error: undefined };
  }
  logger().warn('Service', `Home ${label} fetch failed after retries`, {
    error: getErrorMessage(result.reason),
  });
  return { items: [], error: result.reason };
}

export async function fetchHomeMangaData(): Promise<HomeMangaData> {
  return scheduleMangaFireRequest(
    'home',
    async () => {
      const [trendingResult, latestResult] = await Promise.allSettled([
        fetchTrendingTitles(),
        fetchLatestTitles(),
      ]);

      const trending = settledValues('trending', trendingResult);
      const latest = settledValues('latest', latestResult);

      const mostViewed = trending.items;
      const newReleases = latest.items;
      const firstError = trending.error ?? latest.error;

      if (mostViewed.length === 0 && newReleases.length === 0) {
        throw firstError instanceof Error
          ? firstError
          : new Error('Failed to fetch home manga data');
      }

      return {
        mostViewed,
        newReleases,
        featuredManga: mostViewed[0] ?? newReleases[0] ?? null,
        partialFailure: firstError !== undefined,
      };
    },
    {
      ttlMs: REQUEST_HUB_TTLS.home,
      shouldCache: (value) => !value.partialFailure,
    }
  );
}

export async function resolveChapterApiId(
  titleHid: string,
  chapterNumber: string,
  language = 'en',
  options?: { force?: boolean }
): Promise<string | null> {
  const normalizedTarget = normalizeChapterNumber(chapterNumber);
  if (!normalizedTarget) return null;

  const normalizedHid = titleHid.trim();
  const chaptersCacheKey = titleChaptersCacheKey(normalizedHid, language);

  if (options?.force) {
    invalidateMangaFireRequestCache(`chapters:${normalizedHid}:${language}`);
  } else {
    const cachedChapters = peekFreshCache<ApiChapterSummary[]>(
      chaptersCacheKey,
      REQUEST_HUB_TTLS.chapters
    );

    if (cachedChapters !== undefined) {
      const cachedMatch = cachedChapters.find(
        (chapter) =>
          normalizeChapterNumber(String(chapter.number)) === normalizedTarget
      );
      return cachedMatch ? String(cachedMatch.id) : null;
    }
  }

  let page = 1;
  let hasNext = true;

  while (hasNext) {
    const data = await apiGet<ApiPaginated<ApiChapterSummary>>(
      `/titles/${normalizedHid}/chapters`,
      { language, page }
    );

    const match = (data.items || []).find(
      (chapter) =>
        normalizeChapterNumber(String(chapter.number)) === normalizedTarget
    );
    if (match) {
      return String(match.id);
    }

    const lastPage = data.meta?.lastPage;
    const pastLastPage = typeof lastPage === 'number' && page >= lastPage;
    const emptyPage = !data.items?.length;

    hasNext =
      Boolean(data.meta?.hasNext) &&
      !pastLastPage &&
      !emptyPage &&
      Boolean(data.meta);
    page += 1;
    if (!data.meta) break;
  }

  return null;
}

export async function fetchChapterPageUrls(
  chapterId: string
): Promise<string[]> {
  const normalizedChapterId = chapterId.trim();
  return scheduleMangaFireRequest(
    `chapter-pages:${normalizedChapterId}`,
    async () => {
      const data = await apiGet<{
        data?: { pages?: ApiChapterPage[] };
      }>(`/chapters/${normalizedChapterId}`);

      const pages = data.data?.pages || [];
      if (!pages.length) {
        throw new Error(`No pages found for chapter ${normalizedChapterId}`);
      }

      return pages.map((page) => page.url).filter(Boolean);
    },
    { ttlMs: REQUEST_HUB_TTLS.chapterPages }
  );
}

export async function titleExists(hid: string): Promise<boolean> {
  try {
    const details = await fetchTitleDetailsIfExists(hid);
    return details != null;
  } catch (error: any) {
    logger().warn('Service', 'titleExists check failed', {
      hid,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function extractChapterIdFromUrl(chapterUrl: string): string | null {
  if (!chapterUrl) return null;

  const patterns = [
    /\/chapter\/(\d+)(?:[/?#]|$)/i,
    /\/api\/chapters\/(\d+)(?:[/?#]|$)/i,
    /\/ajax\/read\/chapter\/(\d+)(?:[/?#]|$)/i,
  ];

  for (const pattern of patterns) {
    const match = chapterUrl.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

export function parseLegacyChapterUrl(chapterUrl: string): {
  titleKey: string;
  chapterNumber: string;
} | null {
  const match = chapterUrl.match(/\/read\/([^/]+)\/[^/]+\/chapter-([^/?#]+)/i);
  if (!match?.[1] || !match?.[2]) {
    return null;
  }

  return {
    titleKey: match[1],
    chapterNumber: match[2],
  };
}
