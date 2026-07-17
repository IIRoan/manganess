import axios from 'axios';
import { decode } from 'html-entities';
import { MANGA_API_URL } from '@/constants/Config';
import {
  searchTitles,
  fetchTitleDetails,
  fetchTitleChapters,
  mapApiTitleToMangaDetails,
  fetchChapterPageUrls,
  resolveChapterApiId,
  extractChapterIdFromUrl,
  parseLegacyChapterUrl,
  titleExists,
  type FetchTitleChaptersOptions,
} from '@/services/mangaFireApi';
import {
  searchAnilistMangaByName,
  updateMangaStatus,
  isLoggedInToAniList,
} from '@/services/anilistService';
import { getMangaData, setMangaData } from '@/services/bookmarkService';
import { setLastReadManga } from './readChapterService';
import { performanceMonitor } from '@/utils/performance';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';
import { stripHtmlToText } from '@/utils/stripHtmlToText';
import {
  getApiRetryDelayMs,
  getRateLimitMaxRetries,
  isRateLimitError,
} from '@/utils/httpErrors';
import {
  REQUEST_HUB_TTLS,
  scheduleMangaFireRequest,
  peekFreshCache,
  primeMangaFireRequestCache,
} from '@/services/mangaFireRequestHub';
import type { Chapter } from '@/types/manga';
import { ChapterImage, ImageDownloadStatus } from '@/types/download';

export class CloudflareDetectedError extends Error {
  html: string;
  constructor(html: string) {
    super('Cloudflare verification detected');
    this.name = 'CloudflareDetectedError';
    this.html = html;
  }
}

export interface MangaItem {
  id: string;
  title: string;
  banner: string;
  imageUrl: string;
  link: string;
  type: string;
}

export interface MangaDetails {
  id?: string;
  title: string;
  alternativeTitle: string;
  status: string;
  description: string;
  author: string[];
  published: string;
  genres: string[];
  rating: string;
  reviewCount: string;
  bannerImage: string;
  chapters: { number: string; title: string; date: string; url: string }[];
  /** API-reported chapter total (may exceed currently loaded pages). */
  totalChapters?: number;
  /** Provider type label, e.g. manga / manhwa / manhua. */
  type?: string;
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';

const MAX_RETRIES = 3;

export const normalizeChapterNumber = (
  value: string | null | undefined
): string => {
  if (!value) {
    return '';
  }

  let normalized = String(value).trim();
  if (!normalized) {
    return '';
  }

  normalized = normalized
    .replace(/^chapter/i, '')
    .replace(/\s+/g, '')
    .replace(/_/g, '.')
    .replace(/(\d)-(?=\d)/g, '$1.')
    .replace(/-+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/[^0-9a-zA-Z.\-]/g, '');

  normalized = normalized.replace(/^[.-]+/, '').replace(/[.-]+$/, '');

  return normalized;
};

// Utility function for retrying API calls with exponential backoff
async function retryApiCall<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  const log = logger();
  let lastError: Error;
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      return await operation();
    } catch (error: any) {
      lastError = error as Error;

      // Don't retry permanent client errors
      const status = error?.response?.status;
      const is403 = status === 403 || error?.message?.includes('403');
      const is404 = status === 404 || error?.message?.includes('404');
      if (is403 || is404) {
        if (is403) {
          log.warn('Network', 'Request failed with 403 - VRF token may be stale', {
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        throw lastError;
      }

      const effectiveMaxRetries = isRateLimitError(error)
        ? getRateLimitMaxRetries()
        : maxRetries;

      if (attempt >= effectiveMaxRetries) {
        if (isRateLimitError(error)) {
          log.warn('Network', 'Rate limit retries exhausted', {
            attempt,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        throw lastError;
      }

      const delay = getApiRetryDelayMs(error, attempt);
      log.warn('Network', 'API call retry scheduled', {
        attempt,
        delayMs: delay,
        rateLimited: isRateLimitError(error),
        error: error instanceof Error ? error.message : String(error),
      });
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

// Validate URL before making requests
function validateUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

let sessionVrfToken: string | null = null;
export function setVrfToken(token: string) {
  sessionVrfToken = token || null;
}
export function getVrfToken(): string | null {
  return sessionVrfToken;
}

export { fetchHomeMangaData, extractChapterIdFromUrl } from '@/services/mangaFireApi';

export const searchManga = async (
  keyword: string,
  _vrfToken?: string
): Promise<MangaItem[]> => {
  if (!keyword || keyword.trim().length === 0) {
    throw new Error('Search keyword is required');
  }

  const log = logger();
  if (isDebugEnabled()) log.info('Service', 'searchManga:start', { keyword });

  const result = await performanceMonitor.measureAsync(
    `searchManga:${keyword}`,
    () => retryApiCall(() => searchTitles(keyword))
  );

  if (isDebugEnabled()) {
    log.info('Service', 'searchManga:done', { keyword, count: result.length });
  }

  return result;
};

// Extract search result parsing into separate function
export function parseSearchResults(html: string): MangaItem[] {
  // Pattern 1: legacy 'unit item-*' cards
  const pattern1 =
    /<div class=\"unit item-\d+\">[\s\S]*?<a href=\"(\/manga\/[^\"]+)\"[\s\S]*?<img src=\"([^\"]+)\"[\s\S]*?<span class=\"type\">([^<]+)<\/span>[\s\S]*?<a href=\"\/manga\/[^\"]+\">([^<]+)<\/a>/g;

  // Pattern 2: Filter grid cards (more generic: anchor->img + type + inner anchor title)
  const pattern2 =
    /<a href=\"(\/manga\/[^\"]+)\"[^>]*>[\s\S]*?<img[^>]*src=\"([^\"]+)\"[^>]*>[\s\S]*?<span class=\"type\">([^<]+)<\/span>[\s\S]*?<a href=\"\/manga\/[^\"]+\">([^<]+)<\/a>/g;

  const toItems = (matches: RegExpMatchArray[]): MangaItem[] =>
    matches
      .map((match) => {
        const link = match[1];
        const id = link ? link.split('/').pop() || '' : '';
        const imageUrl = match[2];
        const validImageUrl = validateUrl(imageUrl || '') ? imageUrl : '';
        return {
          id,
          link: `${MANGA_API_URL}${link || ''}`,
          title: decode(match[4]?.trim() || ''),
          banner: validImageUrl || '',
          imageUrl: validImageUrl || '',
          type: decode(match[3]?.trim() || ''),
        } as MangaItem;
      })
      .filter((item) => item.id && item.title);

  const m1 = [...html.matchAll(pattern1)];
  let items = toItems(m1 as unknown as RegExpMatchArray[]);

  if (items.length === 0) {
    const m2 = [...html.matchAll(pattern2)];
    items = toItems(m2 as unknown as RegExpMatchArray[]);
  }

  // Deduplicate by id
  const seen = new Set<string>();
  const unique = items.filter((it) => {
    if (seen.has(it.id)) return false;
    seen.add(it.id);
    return true;
  });

  return unique;
}

export interface FetchMangaDetailsOptions {
  force?: boolean;
  /** Stop chapter pagination early (screen left / manga id changed). */
  shouldCancel?: () => boolean;
  /** Deliver a usable MangaDetails as soon as the first chapter page arrives. */
  onPartial?: (details: MangaDetails) => void;
  /** Pagination meta from chapter list pages (for progressive loading UIs). */
  onChapterPagination?: (meta: {
    page: number;
    hasMore: boolean;
    lastPage?: number;
    total?: number;
  }) => void;
  /**
   * Cap how many /chapters pages to pull.
   * Use `1` on the manga details screen so opening One Piece does not spam 40+ requests.
   */
  maxChapterPages?: number;
}

export const fetchMangaDetails = async (
  id: string,
  options?: FetchMangaDetailsOptions
): Promise<MangaDetails> => {
  if (!id || id.trim().length === 0) {
    throw new Error('Manga ID is required');
  }

  const log = logger();
  const normalizedId = id.trim();
  const detailsCacheKey = `details:${normalizedId}`;
  const isPartialChapterLoad =
    typeof options?.maxChapterPages === 'number' &&
    options.maxChapterPages > 0;

  if (isDebugEnabled()) {
    log.info('Service', 'fetchMangaDetails:start', {
      id: normalizedId,
      maxChapterPages: options?.maxChapterPages,
    });
  }

  // Full-list cache only — never treat a 1-page preview as the complete details.
  if (!options?.force && !isPartialChapterLoad) {
    const cached = peekFreshCache<MangaDetails>(
      detailsCacheKey,
      REQUEST_HUB_TTLS.mangaDetails
    );
    if (cached !== undefined) {
      options?.onPartial?.(cached);
      if (isDebugEnabled()) {
        log.info('Service', 'fetchMangaDetails:cache-hit', {
          id: normalizedId,
          chapterCount: cached.chapters?.length ?? 0,
        });
      }
      return cached;
    }
  }

  const loadDetails = async (): Promise<MangaDetails> =>
    retryApiCall(async () => {
      const title = await fetchTitleDetails(normalizedId);
      const chapterFetchOptions: FetchTitleChaptersOptions = {};
      let knownTotalChapters: number | undefined;

      if (options?.shouldCancel) {
        chapterFetchOptions.shouldCancel = options.shouldCancel;
      }
      if (typeof options?.maxChapterPages === 'number') {
        chapterFetchOptions.maxPages = options.maxChapterPages;
      }
      if (options?.onPartial || options?.onChapterPagination) {
        chapterFetchOptions.onPage = (chaptersSoFar, meta) => {
          if (typeof meta.total === 'number' && meta.total > 0) {
            knownTotalChapters = meta.total;
          }
          options.onChapterPagination?.(meta);
          if (options.onPartial && (meta.page === 1 || !meta.hasMore)) {
            options.onPartial(
              mapApiTitleToMangaDetails(title, chaptersSoFar, {
                ...(knownTotalChapters != null
                  ? { totalChapters: knownTotalChapters }
                  : {}),
              })
            );
          }
        };
      }

      const chapters = await fetchTitleChapters(
        normalizedId,
        chapterFetchOptions
      );

      return mapApiTitleToMangaDetails(title, chapters, {
        ...(knownTotalChapters != null
          ? { totalChapters: knownTotalChapters }
          : {}),
      });
    });

  const useUncachedPath =
    Boolean(options?.shouldCancel) ||
    Boolean(options?.onPartial) ||
    Boolean(options?.onChapterPagination) ||
    isPartialChapterLoad;

  const details = useUncachedPath
    ? await performanceMonitor.measureAsync(
        `fetchMangaDetails:${normalizedId}`,
        loadDetails
      )
    : await scheduleMangaFireRequest(
        detailsCacheKey,
        () =>
          performanceMonitor.measureAsync(
            `fetchMangaDetails:${normalizedId}`,
            loadDetails
          ),
        {
          ttlMs: REQUEST_HUB_TTLS.mangaDetails,
          force: options?.force,
        }
      );

  // Only prime the full-details cache when we fetched every chapter page.
  if (
    useUncachedPath &&
    !isPartialChapterLoad &&
    !options?.shouldCancel?.() &&
    (details.chapters?.length ?? 0) > 0
  ) {
    primeMangaFireRequestCache(detailsCacheKey, details);
  }

  if (isDebugEnabled()) {
    log.info('Service', 'fetchMangaDetails:done', {
      id: normalizedId,
      chapterCount: details.chapters?.length ?? 0,
      maxChapterPages: options?.maxChapterPages,
    });
  }

  return details;
};

export type MangaAvailabilityStatus = 'exists' | 'missing' | 'unknown';

export const checkMangaAvailability = async (
  id: string
): Promise<MangaAvailabilityStatus> => {
  if (!id || id.trim().length === 0) {
    throw new Error('Manga ID is required');
  }

  const normalizedId = id.trim();
  const log = logger();

  try {
    const exists = await titleExists(normalizedId);
    return exists ? 'exists' : 'missing';
  } catch (error) {
    log.warn('Network', 'Failed to validate manga availability', {
      mangaId: normalizedId,
      error: error instanceof Error ? error.message : String(error),
    });
    return 'unknown';
  }
};

export const parseMangaDetails = (html: string): MangaDetails => {
  const title = decode(
    html.match(/<h1 itemprop="name">(.*?)<\/h1>/)?.[1] || 'Unknown Title'
  );
  const alternativeTitle = decode(html.match(/<h6>(.*?)<\/h6>/)?.[1] || '');
  const status = html.match(/<p>(.*?)<\/p>/)?.[1] || 'Unknown Status';

  const descriptionMatch = html.match(
    /<div class="modal fade" id="synopsis">[\s\S]*?<div class="modal-content p-4">\s*<div class="modal-close"[^>]*>[\s\S]*?<\/div>\s*([\s\S]*?)\s*<\/div>/
  );
  let description = descriptionMatch?.[1]
    ? decode(descriptionMatch[1].trim()) || 'No description available'
    : 'No description available';

  description = stripHtmlToText(description);

  const authorMatch = html.match(
    /<span>Author:<\/span>.*?<span>(.*?)<\/span>/s
  );
  const authors = authorMatch?.[1]
    ? authorMatch[1]
        .match(/<a[^>]*>(.*?)<\/a>/g)
        ?.map((a) => stripHtmlToText(a)) || []
    : [];

  const published =
    html.match(/<span>Published:<\/span>.*?<span>(.*?)<\/span>/s)?.[1] ||
    'Unknown';

  const genresMatch = html.match(
    /<span>Genres:<\/span>.*?<span>(.*?)<\/span>/s
  );
  const genres = genresMatch?.[1]
    ? genresMatch[1]
        .match(/<a[^>]*>(.*?)<\/a>/g)
        ?.map((a) => stripHtmlToText(a)) || []
    : [];

  const rating =
    html.match(
      /<span class="live-score" itemprop="ratingValue">(.*?)<\/span>/
    )?.[1] || 'N/A';
  const reviewCount =
    html.match(/<span itemprop="reviewCount".*?>(.*?)<\/span>/)?.[1] || '0';
  const bannerImageMatch = html.match(
    /<div class="poster">.*?<img src="(.*?)" itemprop="image"/s
  );
  const bannerImage = bannerImageMatch ? bannerImageMatch[1] : '';

  const typeMatch =
    html.match(/<span[^>]*class="[^"]*\btype\b[^"]*"[^>]*>(.*?)<\/span>/i) ||
    html.match(/itemprop="additionalType"[^>]*content="([^"]+)"/i);
  const type = typeMatch?.[1] ? stripHtmlToText(typeMatch[1]) : undefined;

  const chapters: {
    url: string;
    number: string;
    title: string;
    date: string;
  }[] = [];

  const chapterItemRegex = /<li class="item"[^>]*>([\s\S]*?)<\/li>/g;
  let match;
  while ((match = chapterItemRegex.exec(html)) !== null) {
    const itemHtml = match[1];
    if (!itemHtml) continue;

    const urlMatch = itemHtml.match(/<a[^>]*href="([^"]+)"/i);
    const rawUrl = urlMatch?.[1] ?? '';

    const spanMatches = [...itemHtml.matchAll(/<span[^>]*>(.*?)<\/span>/gi)];
    if (spanMatches.length === 0) continue;

    const rawHeading = decode(spanMatches[0]?.[1] ?? '').trim();
    const rawDate = decode(
      spanMatches[spanMatches.length - 1]?.[1]?.trim() ?? ''
    );

    const extractChapterNumber = (
      heading: string
    ): { number: string; extraTitle: string } => {
      const normalizedHeading = heading.replace(/\s+/g, ' ').trim();
      const chapterPrefixMatch = normalizedHeading.match(/^Chapter\s+(.*)$/i);
      if (!chapterPrefixMatch) {
        return {
          number: normalizeChapterNumber(normalizedHeading),
          extraTitle: '',
        };
      }

      const remainder = chapterPrefixMatch[1]?.trim() ?? '';
      const [numberPartRaw, ...titleParts] = remainder.split(':');
      const numberPart = normalizeChapterNumber(numberPartRaw ?? '');
      const fallbackNumber = normalizeChapterNumber(remainder);
      return {
        number: numberPart || fallbackNumber,
        extraTitle: titleParts.join(':').trim(),
      };
    };

    const { number: extractedNumber, extraTitle } =
      extractChapterNumber(rawHeading);

    let chapterNumber = extractedNumber;
    if (!chapterNumber) {
      const urlNumberMatch = rawUrl.match(/chapter-([^/?#]+)/i);
      if (urlNumberMatch?.[1]) {
        chapterNumber = normalizeChapterNumber(urlNumberMatch[1]);
      }
    }

    if (!chapterNumber) {
      continue;
    }

    const chapterTitle = extraTitle
      ? `Chapter ${chapterNumber}: ${extraTitle}`
      : `Chapter ${chapterNumber}`;

    chapters.push({
      url: rawUrl,
      number: chapterNumber,
      title: chapterTitle,
      date: rawDate,
    });
  }

  return {
    title,
    alternativeTitle,
    status,
    description,
    author: authors,
    published,
    genres,
    rating,
    reviewCount,
    bannerImage: bannerImage || '',
    chapters: chapters.filter((ch) => ch.number && ch.url && ch.date),
    ...(type ? { type } : {}),
  };
};

export const getChapterUrl = (id: string, chapterNumber: string): string => {
  const rawChapter = String(chapterNumber ?? '').trim();
  const normalizedNumber = normalizeChapterNumber(rawChapter) || rawChapter;
  // Legacy read URL kept for compatibility; prefer loadOnlineChapterImages for reading.
  return `${MANGA_API_URL}/read/${id}/en/chapter-${normalizedNumber}`;
};

export function getChapterApiIdFromList(
  chapters: Chapter[] | undefined,
  chapterNumber: string
): string | null {
  const normalized = normalizeChapterNumber(chapterNumber);
  if (!normalized || !chapters?.length) {
    return null;
  }

  for (const chapter of chapters) {
    if (normalizeChapterNumber(chapter.number) !== normalized) {
      continue;
    }

    const chapterApiId = extractChapterIdFromUrl(chapter.url);
    if (chapterApiId) {
      return chapterApiId;
    }
  }

  return null;
}

export async function loadOnlineChapterImages(
  mangaId: string,
  chapterNumber: string,
  chapters?: Chapter[]
): Promise<ChapterImage[]> {
  const normalized =
    normalizeChapterNumber(chapterNumber) || String(chapterNumber ?? '').trim();
  if (!normalized) {
    throw new Error('Chapter number is required');
  }

  let chapterApiId = getChapterApiIdFromList(chapters, normalized);
  if (!chapterApiId) {
    chapterApiId = await resolveChapterApiId(mangaId.trim(), normalized);
  }

  if (!chapterApiId) {
    throw new Error(`Chapter ${normalized} not found`);
  }

  const pageUrls = await fetchChapterPageUrls(chapterApiId);
  if (!pageUrls.length) {
    throw new Error(`No pages found for chapter ${normalized}`);
  }

  return pageUrls.map((url, index) => ({
    pageNumber: index + 1,
    originalUrl: url,
    localPath: url,
    downloadStatus: ImageDownloadStatus.COMPLETED,
  }));
}
export const markChapterAsRead = async (
  id: string,
  chapterNumber: string,
  mangaTitle: string
) => {
  const log = logger();
  if (!id || !chapterNumber || !mangaTitle) {
    log.error('Storage', 'Invalid parameters for markChapterAsRead', {
      id,
      chapterNumber,
      mangaTitle,
    });
    return;
  }

  try {
    if (isDebugEnabled())
      log.info('Storage', 'Updating last read manga', {
        id,
        mangaTitle,
        chapterNumber,
      });
    await setLastReadManga(id, mangaTitle, chapterNumber);

    const mangaData = await getMangaData(id);
    if (mangaData) {
      const updatedReadChapters = Array.from(
        new Set([...mangaData.readChapters, chapterNumber])
      );
      const highestChapter = Math.max(
        ...updatedReadChapters.map((ch) => parseFloat(ch))
      ).toString();
      const shouldRefreshTitle =
        !mangaData.title ||
        mangaData.title === 'Chapter' ||
        mangaData.title === 'Unknown';
      await setMangaData({
        ...mangaData,
        ...(shouldRefreshTitle ? { title: mangaTitle } : {}),
        readChapters: updatedReadChapters,
        lastReadChapter: highestChapter,
        lastUpdated: Date.now(),
      });

      if (isDebugEnabled())
        log.info('Storage', 'Marked chapter as read', {
          id,
          mangaTitle,
          chapterNumber,
        });
    } else {
      await setMangaData({
        id,
        title: mangaTitle,
        bannerImage: '',
        bookmarkStatus: null,
        readChapters: [chapterNumber],
        lastReadChapter: chapterNumber,
        lastUpdated: Date.now(),
      });
    }
  } catch (error) {
    log.error('Storage', 'Error marking chapter as read', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const getBookmarkStatus = async (id: string): Promise<string | null> => {
  const log = logger();
  try {
    const mangaData = await getMangaData(id);
    return mangaData?.bookmarkStatus || null;
  } catch (error) {
    log.error('Storage', 'Error getting bookmark status', {
      id,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

export const updateAniListProgress = async (
  id: string,
  mangaTitle: string,
  progress: number,
  bookmarkStatus: string
) => {
  const log = logger();
  if (!mangaTitle) {
    log.error('Network', 'Manga title is undefined for AniList update', {
      id,
    });
    return;
  }

  try {
    const isLoggedIn = await isLoggedInToAniList();
    if (!isLoggedIn) {
      log.info('Network', 'AniList update skipped: user not logged in', {
        id,
        mangaTitle,
      });
      return;
    }

    const anilistManga = await searchAnilistMangaByName(mangaTitle);
    if (anilistManga) {
      let status: string;
      switch (bookmarkStatus) {
        case 'To Read':
          status = 'PLANNING';
          break;
        case 'Reading':
          status = 'CURRENT';
          break;
        case 'Read':
          status = 'COMPLETED';
          break;
        default:
          status = 'CURRENT';
      }
      await updateMangaStatus(anilistManga.id, status, progress);
      log.info('Network', 'Updated AniList progress', {
        id,
        mangaTitle,
        progress,
        status,
      });
    } else {
      log.warn('Network', 'Manga not found on AniList', {
        id,
        mangaTitle,
      });
    }
  } catch (error) {
    log.error('Network', 'Error updating AniList progress', {
      id,
      mangaTitle,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

export const parseNewReleases = (html: string): MangaItem[] => {
  const log = logger();
  const homeSwiperRegex = /<section class="home-swiper">([\s\S]*?)<\/section>/g;
  const homeSwiperMatches = Array.from(html.matchAll(homeSwiperRegex));

  for (const match of homeSwiperMatches) {
    const swiperContent = match[1];

    if (swiperContent && swiperContent.includes('<h2>New Release</h2>')) {
      const itemRegex =
        /<div class="swiper-slide unit[^"]*">\s*<a href="\/manga\/([^"]+)">\s*<div class="poster">\s*<div><img src="([^"]+)" alt="([^"]+)"><\/div>\s*<\/div>\s*<span>([^<]+)<\/span>\s*<\/a>\s*<\/div>/g;
      const matches = Array.from(swiperContent?.matchAll(itemRegex) || []);

      return matches.map((match) => ({
        id: match[1] || '',
        imageUrl: match[2] || '',
        title: decode(match[4]?.trim() || ''),
        banner: '',
        link: `/manga/${match[1] || ''}`,
        type: 'manga',
      }));
    }
  }

  if (isDebugEnabled())
    log.info('Service', 'Could not find "New Release" section');
  return [];
};

export const parseMostViewedManga = (html: string): MangaItem[] => {
  const regex =
    /<div class="swiper-slide unit[^>]*>.*?<a href="\/manga\/([^"]+)".*?<b>(\d+)<\/b>.*?<img src="([^"]+)".*?alt="([^"]+)".*?<\/a>/gs;
  const matches = [...html.matchAll(regex)];
  return matches.slice(0, 10).map((match) => ({
    id: match[1] || '',
    rank: parseInt(match[2] || '0'),
    imageUrl: match[3] || '',
    title: decode(match[4] || ''),
    banner: '',
    link: `/manga/${match[1] || ''}`,
    type: 'manga',
  }));
};

// Function to get VRF token from the chapter page using the same method as search
export const getVrfTokenFromChapterPage = async (
  chapterUrl: string
): Promise<string | null> => {
  const log = logger();
  try {
    const fullUrl = chapterUrl.startsWith('http')
      ? chapterUrl
      : `${MANGA_API_URL}${chapterUrl}`;

    if (isDebugEnabled()) {
      log.info('Service', 'Getting VRF token from chapter page', {
        chapterUrl: fullUrl,
      });
    }

    const response = await axios.get(fullUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        Referer: MANGA_API_URL,
      },
      timeout: 15000,
    });

    const html = response.data;

    // Look for VRF token in form inputs (same as search page)
    const vrfInputMatch =
      html.match(/<input[^>]*name[^>]*vrf[^>]*value[^>]*["']([^"']+)["']/i) ||
      html.match(/<input[^>]*value[^>]*["']([^"']+)["'][^>]*name[^>]*vrf/i);

    if (vrfInputMatch && vrfInputMatch[1]) {
      const vrfToken = vrfInputMatch[1];
      if (vrfToken.length > 20 && vrfToken.includes('-')) {
        if (isDebugEnabled()) {
          log.info('Service', 'VRF token found in form input', {
            preview: vrfToken.substring(0, 20),
          });
        }
        return vrfToken;
      }
    }

    // Fallback: extract VRF from HTML using existing method
    return extractVrfTokenFromHtml(html);
  } catch (error) {
    log.error('Service', 'Error getting VRF token from chapter page', {
      chapterUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

// Generate JavaScript injection code for cleaning up web content
// Function to fetch chapter images by loading the chapter page in background and then calling the API
export const fetchChapterImagesFromUrl = async (
  chapterUrl: string,
  _vrfToken?: string
): Promise<{ images: string[][]; status: number }> => {
  if (!chapterUrl || chapterUrl.trim().length === 0) {
    throw new Error('Chapter URL is required');
  }

  const log = logger();
  if (isDebugEnabled()) {
    log.info('Service', 'fetchChapterImagesFromUrl:start', { chapterUrl });
  }

  try {
    let chapterId = extractChapterIdFromUrl(chapterUrl);

    if (!chapterId) {
      const legacy = parseLegacyChapterUrl(chapterUrl);
      if (legacy) {
        chapterId = await resolveChapterApiId(
          legacy.titleKey,
          legacy.chapterNumber
        );
      }
    }

    if (!chapterId) {
      chapterId = await getChapterIdFromPage(chapterUrl);
    }

    if (!chapterId) {
      throw new Error(
        `Could not extract chapter ID from chapter page: ${chapterUrl}`
      );
    }

    const result = await fetchChapterImages(chapterId, undefined, chapterUrl);

    if (isDebugEnabled()) {
      log.info('Service', 'fetchChapterImagesFromUrl:success', {
        chapterUrl,
        chapterId,
        imageCount: result.images.length,
      });
    }

    return result;
  } catch (error) {
    log.error('Service', 'fetchChapterImagesFromUrl:error', {
      chapterUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

// New function to fetch chapter images using the MangaFire API
export const fetchChapterImages = async (
  chapterId: string,
  _vrfToken?: string,
  _refererUrl?: string
): Promise<{ images: string[][]; status: number }> => {
  if (!chapterId || chapterId.trim().length === 0) {
    throw new Error('Chapter ID is required');
  }

  const log = logger();
  if (isDebugEnabled()) {
    log.info('Service', 'fetchChapterImages:start', { chapterId });
  }

  const result = await performanceMonitor.measureAsync(
    `fetchChapterImages:${chapterId}`,
    () =>
      retryApiCall(async () => {
        const pageUrls = await fetchChapterPageUrls(chapterId.trim());
        return {
          images: pageUrls.map((url) => [url]),
          status: 200,
        };
      })
  );

  if (isDebugEnabled()) {
    log.info('Service', 'fetchChapterImages:done', {
      chapterId,
      imageCount: result.images.length,
    });
  }

  return result;
};

/**
 * Fetch chapter images using intercepted WebView request data
 * This is the preferred method for mobile as it doesn't require parsing HTML
 * or making additional requests to extract VRF tokens
 */
export const fetchChapterImagesFromInterceptedRequest = async (
  chapterId: string,
  vrfToken: string,
  refererUrl?: string
): Promise<{ images: string[][]; status: number }> => {
  const log = logger();

  if (isDebugEnabled()) {
    log.info('Service', 'fetchChapterImagesFromInterceptedRequest:start', {
      chapterId,
      vrfTokenPreview: vrfToken.substring(0, 30) + '...',
    });
  }

  try {
    // Use the intercepted data directly to fetch images
    const result = await fetchChapterImages(chapterId, vrfToken, refererUrl);

    if (isDebugEnabled()) {
      log.info('Service', 'fetchChapterImagesFromInterceptedRequest:success', {
        chapterId,
        imageCount: result.images.length,
      });
    }

    return result;
  } catch (error) {
    log.error('Service', 'fetchChapterImagesFromInterceptedRequest:error', {
      chapterId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

// Function to extract VRF token from HTML
export const extractVrfTokenFromHtml = (html: string): string | null => {
  const log = logger();
  try {
    // Multiple patterns to find VRF token (more specific patterns first)
    const vrfPatterns = [
      // Specific attribute patterns with proper = handling (check these first)
      /data-vrf\s*=\s*["']([a-zA-Z0-9+/]+)["']/gi,
      // Script variable assignments
      /var\s+vrf\s*=\s*["']([a-zA-Z0-9+/=]+)["']/gi,
      /let\s+vrf\s*=\s*["']([a-zA-Z0-9+/=]+)["']/gi,
      /const\s+vrf\s*=\s*["']([a-zA-Z0-9+/=]+)["']/gi,
      // JSON-like patterns
      /"vrf"\s*:\s*["']([a-zA-Z0-9+/=]+)["']/gi,
      /vrfToken\s*[:=]\s*["']([a-zA-Z0-9+/=]+)["']/gi,
      /vrf_token\s*[:=]\s*["']([a-zA-Z0-9+/=]+)["']/gi,
      // Look for base64-like strings that could be VRF tokens
      /["'](ZBYeRCjYBk0[a-zA-Z0-9+/=]{40,})["']/gi,
      // Generic vrf pattern (last resort, less specific)
      /\bvrf\s*[:=]\s*["']([a-zA-Z0-9+/=]+)["']/gi,
    ];

    for (const pattern of vrfPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 20) {
          // VRF tokens are typically long
          if (isDebugEnabled()) {
            log.info('Service', 'VRF token found in HTML', {
              preview: match[1].substring(0, 20),
            });
          }
          return match[1];
        }
      }
    }

    // Fallback: look for any base64-like strings
    const base64Pattern = /[a-zA-Z0-9+/]{40,}={0,2}/g;
    const base64Matches = html.match(base64Pattern);

    if (base64Matches) {
      // Use the longest one as it's likely the VRF token
      const longestMatch = base64Matches.reduce((a, b) =>
        a.length > b.length ? a : b
      );
      if (longestMatch.length > 40) {
        if (isDebugEnabled()) {
          log.info('Service', 'Using base64 string as VRF token', {
            preview: longestMatch.substring(0, 20),
          });
        }
        return longestMatch;
      }
    }

    return null;
  } catch (error) {
    log.error('Service', 'Error extracting VRF token', {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

// Function to get chapter ID by loading the chapter page and extracting it
export const getChapterIdFromPage = async (
  chapterUrl: string
): Promise<string | null> => {
  const log = logger();
  try {
    const directId = extractChapterIdFromUrl(chapterUrl);
    if (directId) {
      return directId;
    }

    const legacy = parseLegacyChapterUrl(
      chapterUrl.startsWith('http')
        ? chapterUrl.replace(MANGA_API_URL, '')
        : chapterUrl
    );
    if (legacy) {
      const resolvedChapterId = await resolveChapterApiId(
        legacy.titleKey,
        legacy.chapterNumber
      );
      if (resolvedChapterId) {
        return resolvedChapterId;
      }
    }

    const fullUrl = chapterUrl.startsWith('http')
      ? chapterUrl
      : `${MANGA_API_URL}${chapterUrl}`;

    if (isDebugEnabled()) {
      log.info('Service', 'Fetching chapter page', {
        chapterUrl: fullUrl,
      });
    }

    const response = await axios.get(fullUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Sec-Ch-Ua':
          '"Microsoft Edge";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
        Referer: MANGA_API_URL,
      },
      timeout: 15000,
    });

    if (!response.data || typeof response.data !== 'string') {
      throw new Error('Invalid response data');
    }

    const html = response.data as string;

    if (isDebugEnabled()) {
      log.info('Service', 'Received chapter HTML', {
        length: html.length,
      });
    }

    // Extract and store VRF token for later use
    const vrfToken = extractVrfTokenFromHtml(html);
    if (vrfToken) {
      setVrfToken(vrfToken);
      if (isDebugEnabled()) {
        log.info('Service', 'VRF token extracted and stored');
      }
    }

    // Enhanced patterns to look for chapter ID in various formats
    const patterns = [
      // Direct chapter ID patterns
      /chapter[_-]?id['":\s]*['"]*(\d+)['"]*(?!\d)/gi,
      /data-chapter-id['":\s]*['"]*(\d+)['"]*(?!\d)/gi,
      /chapterId['":\s]*['"]*(\d+)['"]*(?!\d)/gi,
      /"chapter_id"['":\s]*['"]*(\d+)['"]*(?!\d)/gi,

      // API endpoint patterns
      /\/ajax\/read\/chapter\/(\d+)(?!\d)/gi,
      /ajax\/read\/chapter\/(\d+)(?!\d)/gi,

      // JavaScript variable patterns
      /var\s+chapterId\s*=\s*['"]*(\d+)['"]*(?!\d)/gi,
      /let\s+chapterId\s*=\s*['"]*(\d+)['"]*(?!\d)/gi,
      /const\s+chapterId\s*=\s*['"]*(\d+)['"]*(?!\d)/gi,

      // JSON-like patterns
      /["']chapterId["']\s*:\s*['"]*(\d+)['"]*(?!\d)/gi,
      /["']chapter_id["']\s*:\s*['"]*(\d+)['"]*(?!\d)/gi,

      // URL patterns in JavaScript
      /url['":\s]*['"]*[^'"]*\/chapter\/(\d+)(?!\d)/gi,

      // Form or input patterns
      /name=['"]*chapter[_-]?id['"]*[^>]*value=['"]*(\d+)['"]*(?!\d)/gi,
      /value=['"]*(\d+)['"]*[^>]*name=['"]*chapter[_-]?id['"]*(?!\d)/gi,

      // Script content patterns
      /chapter['":\s]*['"]*(\d{6,})['"]*(?!\d)/gi,
    ];

    // Try each pattern
    for (const pattern of patterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length >= 4) {
          // Ensure it's a reasonable ID length
          if (isDebugEnabled()) {
            log.info('Service', 'Extracted chapter ID from HTML pattern', {
              chapterId: match[1],
              pattern: pattern.source,
              chapterUrl,
            });
          }
          return match[1];
        }
      }
    }

    // Fallback: search for numeric chapter IDs in page content.
    const numericIds = html.match(/\b\d{6,8}\b/g);
    if (numericIds && numericIds.length > 0) {
      // Filter out common false positives
      const filteredIds = numericIds.filter((id) => {
        const num = parseInt(id);
        return (
          num > 100000 &&
          num < 99999999 &&
          !id.startsWith('20') && // Not a year
          !id.includes('000000')
        ); // Not a round number
      });

      if (filteredIds.length > 0) {
        if (isDebugEnabled()) {
          log.info('Service', 'Using heuristic chapter ID', {
            chapterId: filteredIds[0],
            chapterUrl,
          });
        }
        return filteredIds[0] || null;
      }
    }

    log.warn('Service', 'Could not extract chapter ID from page', {
      chapterUrl,
    });
    if (isDebugEnabled()) {
      // Log a sample of the HTML for debugging
      log.info('Service', 'Chapter page HTML sample', {
        chapterUrl,
        sample: html.substring(0, 1000),
      });
    }
    return null;
  } catch (error) {
    log.error('Service', 'Error getting chapter ID from page', {
      chapterUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
};

// Utility function to test if the API endpoint is accessible
export const testApiEndpoint = async (): Promise<boolean> => {
  const log = logger();
  try {
    // Test with a simple request to the base API
    const response = await axios.get(`${MANGA_API_URL}`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
      timeout: 10000,
    });

    return response.status === 200;
  } catch (error) {
    log.error('Network', 'API endpoint test failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

// Utility function to extract chapter info from URL for debugging
export const parseChapterUrl = (
  chapterUrl: string
): { mangaId?: string; chapterNumber?: string } => {
  const log = logger();
  try {
    // Parse URLs like: /read/manga-id/en/chapter-123
    const urlParts = chapterUrl.split('/').filter((part) => part.length > 0);

    if (urlParts.length >= 4 && urlParts[0] === 'read') {
      const mangaId = urlParts[1];
      const chapterPart = urlParts[3]; // e.g., "chapter-123"

      if (mangaId && chapterPart && chapterPart.startsWith('chapter-')) {
        const chapterNumber = chapterPart.replace('chapter-', '');
        return { mangaId, chapterNumber };
      }
    }

    return {};
  } catch (error) {
    log.error('Service', 'Error parsing chapter URL', {
      chapterUrl,
      error: error instanceof Error ? error.message : String(error),
    });
    return {};
  }
};

// Batch function to pre-load multiple chapters efficiently with rate limiting
export const batchFetchChapterImages = async (
  chapterUrls: string[],
  options: {
    maxConcurrent?: number;
    delayBetweenRequests?: number;
    onProgress?: (completed: number, total: number, currentUrl: string) => void;
    onError?: (error: Error, url: string) => void;
  } = {}
): Promise<Array<{ url: string; images?: string[][]; error?: string }>> => {
  const log = logger();
  const {
    maxConcurrent = 2, // Limit concurrent requests to avoid overwhelming the server
    delayBetweenRequests = 1000, // 1 second delay between batches
    onProgress,
    onError,
  } = options;

  const results: Array<{ url: string; images?: string[][]; error?: string }> =
    [];
  let completed = 0;

  if (isDebugEnabled()) {
    log.info('Service', 'Starting batch fetch for chapters', {
      totalChapters: chapterUrls.length,
      maxConcurrent,
      delayBetweenRequests,
    });
  }

  // Process chapters in batches
  for (let i = 0; i < chapterUrls.length; i += maxConcurrent) {
    const batch = chapterUrls.slice(i, i + maxConcurrent);

    // Process current batch concurrently
    const batchPromises = batch.map(async (url) => {
      try {
        onProgress?.(completed, chapterUrls.length, url);

        const result = await fetchChapterImagesFromUrl(url);
        completed++;

        onProgress?.(completed, chapterUrls.length, url);

        return { url, images: result.images };
      } catch (error) {
        completed++;
        const errorMsg = error instanceof Error ? error.message : String(error);

        onError?.(error instanceof Error ? error : new Error(errorMsg), url);
        onProgress?.(completed, chapterUrls.length, url);

        return { url, error: errorMsg };
      }
    });

    // Wait for current batch to complete
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Add delay between batches (except for the last batch)
    if (i + maxConcurrent < chapterUrls.length && delayBetweenRequests > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenRequests));
    }
  }

  if (isDebugEnabled()) {
    const successful = results.filter((r) => !r.error).length;
    const failed = results.filter((r) => r.error).length;
    log.info('Service', 'Batch fetch completed', {
      successful,
      failed,
    });
  }

  return results;
};

export const getInjectedJavaScript = (backgroundColor: string) => {
  const cleanupFunctions = {
    removeElements: `
      function removeElements(selectors) {
        selectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => el.remove());
          } catch (e) {
            /* ignore */
          }
        });
      }`,

    hideElements: `
      function hideElements(selectors) {
        selectors.forEach(selector => {
          try {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => {
              el.style.display = 'none';
              el.style.visibility = 'hidden';
              el.style.opacity = '0';
              el.style.pointerEvents = 'none';
            });
          } catch (e) {
            /* ignore */
          }
        });
      }`,

    adjustBackground: `
      function adjustBackground() {
        try {
          const bgSpan = document.querySelector('span.bg');
          if (bgSpan) {
            bgSpan.style.backgroundImage = 'none';
            bgSpan.style.backgroundColor = '${backgroundColor}';
          }
          document.body.style.backgroundImage = 'none';
          document.body.style.backgroundColor = '${backgroundColor}';
        } catch (e) {
          /* ignore */
        }
      }`,

    blockScripts: `
      function blockMaliciousScripts() {
        try {
          const scriptBlocker = {
            apply: function(target, thisArg, argumentsList) {
              const src = argumentsList[0]?.src || '';
              if (src.includes('ads') || src.includes('analytics') || src.includes('tracker')) {
                return null;
              }
              return target.apply(thisArg, argumentsList);
            }
          };
          document.createElement = new Proxy(document.createElement, scriptBlocker);
        } catch (e) {
          /* ignore */
        }
      }`,

    disablePopups: `
      function disablePopups() {
        try {
          window.open = function() { return null; };
          window.alert = function() { return null; };
          window.confirm = function() { return null; };
          window.prompt = function() { return null; };
        } catch (e) {
          /* ignore */
        }
      }`,
  };

  return `
    (function() {
      ${cleanupFunctions.removeElements}
      ${cleanupFunctions.hideElements}
      ${cleanupFunctions.adjustBackground}
      ${cleanupFunctions.blockScripts}
      ${cleanupFunctions.disablePopups}

      function cleanPage() {
        removeElements([
          'header', 'footer', '.ad-container', 
          '[id^="google_ads_"]', '[id^="adsbygoogle"]', 
          'iframe[src*="googleads"]', 'iframe[src*="doubleclick"]',
          '.navbar', '.nav-bar', '#navbar', '#nav-bar', '.top-bar', '#top-bar'
        ]);
        
        hideElements([
          '#toast', '.toast', '.popup', '.modal', 
          '#overlay', '.overlay', '.banner'
        ]);
        
        adjustBackground();
      }

      // Initial cleanup
      cleanPage();
      blockMaliciousScripts();
      disablePopups();

      // Set up observer for dynamic content
      try {
        const observer = new MutationObserver(() => {
          cleanPage();
        });
        observer.observe(document.body, { childList: true, subtree: true });
      } catch (e) {
        /* ignore */
      }

      return true;
    })();
  `;
};
