import axios, { type AxiosRequestConfig } from 'axios';
import { MANGA_API_URL } from '@/constants/Config';
import { logger } from '@/utils/logger';
import { stripHtmlToText } from '@/utils/stripHtmlToText';
import {
  peekFreshCache,
  REQUEST_HUB_TTLS,
  scheduleMangaFireRequest,
  withMangaFireRateLimit,
} from '@/services/mangaFireRequestHub';
import type { MangaItem } from '@/types/manga';
import type { Chapter, MangaDetails } from '@/types/manga';

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
  url: string;
}

export interface ApiTitleDetails extends ApiTitleSummary {
  synopsisHtml?: string;
  altTitles?: string[];
  rating?: number | string;
  ratingCount?: number | string;
  follows?: number;
  languages?: string[];
  genres?: Array<{ id?: number; name: string; slug?: string } | string>;
  themes?: Array<{ id?: number; name: string; slug?: string } | string>;
  demographics?: Array<{ id?: number; name: string; slug?: string } | string>;
  authors?: Array<{ id?: number; name: string } | string>;
  artists?: Array<{ id?: number; name: string } | string>;
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

async function apiGet<T>(
  path: string,
  params?: Record<string, unknown>,
  config?: AxiosRequestConfig
): Promise<T> {
  return withMangaFireRateLimit(async () => {
    const response = await axios.get<T>(`${API_BASE}${path}`, {
      headers: DEFAULT_HEADERS,
      timeout: 20000,
      params,
      ...config,
    });
    return response.data;
  });
}

function mapNames(
  values?: Array<{ name?: string } | string>
): string[] {
  if (!values?.length) return [];
  return values
    .map((value) => (typeof value === 'string' ? value : value.name || ''))
    .filter(Boolean);
}

export function mapApiTitleToMangaItem(
  item: ApiTitleSummary,
  rank?: number
): MangaItem {
  const poster =
    item.poster?.medium || item.poster?.large || item.poster?.small || '';
  const mapped: MangaItem = {
    id: item.hid,
    title: item.title,
    banner: item.poster?.large || poster,
    imageUrl: poster,
    link: item.url.startsWith('http')
      ? item.url
      : `${MANGA_API_URL}${item.url}`,
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
  const data = await apiGet<ApiPaginated<ApiTitleSummary>>('/titles', {
    'order[chapter_updated_at]': 'desc',
    limit,
  });
  return (data.items || []).map((item) => mapApiTitleToMangaItem(item));
}

export async function searchTitles(keyword: string, limit = 40): Promise<MangaItem[]> {
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

export async function fetchTitleDetails(hid: string): Promise<ApiTitleDetails> {
  const normalizedHid = hid.trim();
  return scheduleMangaFireRequest(
    `title:${normalizedHid}`,
    async () => {
      const data = await apiGet<{ data: ApiTitleDetails }>(
        `/titles/${normalizedHid}`
      );
      return data.data;
    },
    { ttlMs: REQUEST_HUB_TTLS.mangaDetails }
  );
}

export async function fetchTitleDetailsIfExists(
  hid: string
): Promise<ApiTitleDetails | null> {
  const normalizedHid = hid.trim();
  return scheduleMangaFireRequest(
    `title-exists:${normalizedHid}`,
    async () => {
      try {
        const response = await withMangaFireRateLimit(() =>
          axios.get<{ data: ApiTitleDetails }>(
            `${API_BASE}/titles/${normalizedHid}`,
            {
              headers: DEFAULT_HEADERS,
              timeout: 20000,
              validateStatus: (status) => status === 200 || status === 404,
            }
          )
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
  const lastPage = data.meta?.lastPage;
  const pastLastPage = typeof lastPage === 'number' && page >= lastPage;
  const emptyPage = items.length === 0;

  return (
    Boolean(data.meta?.hasNext) &&
    !pastLastPage &&
    !emptyPage &&
    Boolean(data.meta)
  );
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

    apiHasMore = shouldContinueChapterPagination(page, data);
    options.onPage?.(chapters, {
      page,
      hasMore: apiHasMore,
      ...(typeof data.meta?.lastPage === 'number'
        ? { lastPage: data.meta.lastPage }
        : {}),
      ...(typeof data.meta?.total === 'number'
        ? { total: data.meta.total }
        : {}),
    });
    page += 1;

    if (!data.meta) {
      break;
    }
  }

  return chapters;
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
    `chapters:${normalizedHid}:${language}`,
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
  const lastPage = data.meta?.lastPage;
  const total = data.meta?.total;
  return {
    chapters: mapApiChapters(data.items || []),
    hasMore: shouldContinueChapterPagination(page, data),
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
      return {
        number,
        title: name ? `Chapter ${number}: ${name}` : `Chapter ${number}`,
        date: chapter.createdAt
          ? new Date(chapter.createdAt * 1000).toLocaleDateString()
          : '',
        url: `/chapter/${chapter.id}`,
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
  const reportedTotal =
    typeof options?.totalChapters === 'number' && options.totalChapters > 0
      ? options.totalChapters
      : mappedChapters.length;

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
    totalChapters: reportedTotal,
    type: title.type,
  };
}

export async function fetchHomeMangaData(): Promise<{
  mostViewed: MangaItem[];
  newReleases: MangaItem[];
  featuredManga: MangaItem | null;
}> {
  return scheduleMangaFireRequest(
    'home',
    async () => {
      const [mostViewed, newReleases] = await Promise.all([
        fetchTrendingTitles(),
        fetchLatestTitles(),
      ]);

      return {
        mostViewed,
        newReleases,
        featuredManga: mostViewed[0] || null,
      };
    },
    { ttlMs: REQUEST_HUB_TTLS.home }
  );
}

export async function resolveChapterApiId(
  titleHid: string,
  chapterNumber: string,
  language = 'en'
): Promise<string | null> {
  const normalizedTarget = normalizeChapterNumber(chapterNumber);
  if (!normalizedTarget) return null;

  const normalizedHid = titleHid.trim();
  const cachedChapters = peekFreshCache<ApiChapterSummary[]>(
    `chapters:${normalizedHid}:${language}`,
    REQUEST_HUB_TTLS.chapters
  );

  if (cachedChapters !== undefined) {
    const cachedMatch = cachedChapters.find(
      (chapter) =>
        normalizeChapterNumber(String(chapter.number)) === normalizedTarget
    );
    return cachedMatch ? String(cachedMatch.id) : null;
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
    const pastLastPage =
      typeof lastPage === 'number' && page >= lastPage;
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
