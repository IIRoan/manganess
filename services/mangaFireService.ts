import axios from 'axios';
import { decode } from 'html-entities';
import { MANGA_API_URL } from '@/constants/Config';
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
import { webViewRequestInterceptor } from './webViewRequestInterceptor';

export class CloudflareDetectedError extends Error {
  html: string;
  constructor(html: string) {
    super('Cloudflare verification detected');
    this.name = 'CloudflareDetectedError';
    this.html = html;
  }
}

function isCloudflareHtml(html: string): boolean {
  if (!html) return false;
  const lowered = html.toLowerCase();
  // Be strict: only treat as Cloudflare challenge when known markers are present
  return (
    lowered.includes('cf-browser-verification') ||
    lowered.includes('cf_captcha_kind') ||
    lowered.includes('attention required') ||
    /\bjust a moment\b/.test(lowered)
  );
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
}

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';

const MAX_RETRIES = 3;
const RETRY_DELAY = 1000;

// Utility function for retrying API calls with exponential backoff
async function retryApiCall<T>(
  operation: () => Promise<T>,
  maxRetries: number = MAX_RETRIES
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;

      if (attempt === maxRetries) {
        throw lastError;
      }

      const delay = RETRY_DELAY * Math.pow(2, attempt - 1);
      console.log(
        `API call failed (attempt ${attempt}), retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
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

export const searchManga = async (
  keyword: string,
  vrfToken?: string
): Promise<MangaItem[]> => {
  if (!keyword || keyword.trim().length === 0) {
    throw new Error('Search keyword is required');
  }

  const log = logger();
  if (isDebugEnabled()) log.info('Service', 'searchManga:start', { keyword });

  const result = await performanceMonitor.measureAsync(
    `searchManga:${keyword}`,
    () =>
      retryApiCall(async () => {
        let searchUrl = `${MANGA_API_URL}/filter?keyword=${encodeURIComponent(keyword.trim())}`;

        // Add VRF token if provided or from session store
        const tokenToUse = vrfToken || sessionVrfToken || '';
        if (tokenToUse) {
          searchUrl += `&vrf=${encodeURIComponent(tokenToUse)}`;
        }

        if (!validateUrl(searchUrl)) {
          throw new Error('Invalid search URL');
        }

        const response = await axios.get(searchUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            Referer: MANGA_API_URL,
          },
          timeout: 20000,
        });

        if (!response.data || typeof response.data !== 'string') {
          throw new Error('Invalid response data');
        }

        const html = response.data as string;
        if (isCloudflareHtml(html)) {
          throw new CloudflareDetectedError(html);
        }
        const items = parseSearchResults(html);
        if (isDebugEnabled())
          log.info('Service', 'searchManga:parsed', { count: items.length });
        return items;
      })
  );
  if (isDebugEnabled())
    log.info('Service', 'searchManga:done', { keyword, count: result.length });
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

export const fetchMangaDetails = async (id: string): Promise<MangaDetails> => {
  if (!id || id.trim().length === 0) {
    throw new Error('Manga ID is required');
  }

  const log = logger();
  if (isDebugEnabled()) log.info('Service', 'fetchMangaDetails:start', { id });
  const details = await performanceMonitor.measureAsync(
    `fetchMangaDetails:${id}`,
    () =>
      retryApiCall(async () => {
        const detailsUrl = `${MANGA_API_URL}/manga/${id.trim()}`;

        if (!validateUrl(detailsUrl)) {
          throw new Error('Invalid manga details URL');
        }

        const response = await axios.get(detailsUrl, {
          headers: {
            'User-Agent': USER_AGENT,
          },
          timeout: 15000, // Longer timeout for details page
        });

        if (!response.data || typeof response.data !== 'string') {
          throw new Error('Invalid response data');
        }

        const html = response.data as string;
        const details = parseMangaDetails(html);
        return { ...details, id: id.trim() };
      })
  );
  if (isDebugEnabled())
    log.info('Service', 'fetchMangaDetails:done', {
      id,
      chapterCount: details.chapters?.length ?? 0,
    });
  return details;
};

const parseMangaDetails = (html: string): MangaDetails => {
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

  description = description
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<(?:.|\n)*?>/gm, '')
    .trim();

  const authorMatch = html.match(
    /<span>Author:<\/span>.*?<span>(.*?)<\/span>/s
  );
  const authors = authorMatch?.[1]
    ? authorMatch[1]
        .match(/<a[^>]*>(.*?)<\/a>/g)
        ?.map((a) => a.replace(/<[^>]*>/g, '')) || []
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
        ?.map((a) => a.replace(/<[^>]*>/g, '')) || []
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

  const chaptersRegex =
    /<li class="item".*?<a href="(.*?)".*?<span>Chapter (\d+):.*?<\/span>.*?<span>(.*?)<\/span>/g;
  const chapters = [];
  let match;
  while ((match = chaptersRegex.exec(html)) !== null) {
    chapters.push({
      url: match[1] || '',
      number: match[2] || '',
      title: `Chapter ${match[2] || ''}`,
      date: match[3] || '',
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
  };
};

export const getChapterUrl = (id: string, chapterNumber: string): string => {
  return `${MANGA_API_URL}/read/${id}/en/chapter-${chapterNumber}`;
};
export const markChapterAsRead = async (
  id: string,
  chapterNumber: string,
  mangaTitle: string
) => {
  if (!id || !chapterNumber || !mangaTitle) {
    console.error('Invalid parameters for markChapterAsRead:', {
      id,
      chapterNumber,
      mangaTitle,
    });
    return;
  }

  try {
    if (isDebugEnabled())
      console.log('Updating last read manga in mangaFireService:', {
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
      await setMangaData({
        ...mangaData,
        readChapters: updatedReadChapters,
        lastReadChapter: highestChapter,
        lastUpdated: Date.now(),
      });

      if (isDebugEnabled())
        console.log(
          `Marked chapter ${chapterNumber} as read for manga ${id} (${mangaTitle})`
        );
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
    console.error('Error marking chapter as read:', error);
  }
};

export const getBookmarkStatus = async (id: string): Promise<string | null> => {
  try {
    const mangaData = await getMangaData(id);
    return mangaData?.bookmarkStatus || null;
  } catch (error) {
    console.error('Error getting bookmark status:', error);
    return null;
  }
};

export const updateAniListProgress = async (
  id: string,
  mangaTitle: string,
  progress: number,
  bookmarkStatus: string
) => {
  if (!mangaTitle) {
    console.error('Manga title is undefined for id:', id);
    return;
  }

  try {
    const isLoggedIn = await isLoggedInToAniList();
    if (!isLoggedIn) {
      console.log('User is not logged in to AniList. Skipping update.');
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
      console.log(
        `Updated AniList progress for "${mangaTitle}" (${id}) to ${progress} chapters with status ${status}`
      );
    } else {
      console.log(`Manga "${mangaTitle}" (${id}) not found on AniList`);
    }
  } catch (error) {
    console.error('Error updating AniList progress:', error);
  }
};

export const parseNewReleases = (html: string): MangaItem[] => {
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

  if (isDebugEnabled()) console.log('Could not find "New Release" section');
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
  try {
    const fullUrl = chapterUrl.startsWith('http')
      ? chapterUrl
      : `${MANGA_API_URL}${chapterUrl}`;

    if (isDebugEnabled()) {
      console.log('Getting VRF token from chapter page:', fullUrl);
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
          console.log(
            'VRF token found in form input:',
            vrfToken.substring(0, 20) + '...'
          );
        }
        return vrfToken;
      }
    }

    // Fallback: extract VRF from HTML using existing method
    return extractVrfTokenFromHtml(html);
  } catch (error) {
    console.error('Error getting VRF token from chapter page:', error);
    return null;
  }
};

// Generate JavaScript injection code for cleaning up web content
// Function to fetch chapter images by loading the chapter page in background and then calling the API
export const fetchChapterImagesFromUrl = async (
  chapterUrl: string,
  vrfToken?: string
): Promise<{ images: string[][]; status: number }> => {
  if (!chapterUrl || chapterUrl.trim().length === 0) {
    throw new Error('Chapter URL is required');
  }

  const log = logger();
  if (isDebugEnabled())
    log.info('Service', 'fetchChapterImagesFromUrl:start', { chapterUrl });

  try {
    // Step 1: Get VRF token if not provided
    let finalVrfToken = vrfToken || sessionVrfToken;

    if (!finalVrfToken) {
      if (isDebugEnabled()) {
        console.log('No VRF token provided, extracting from chapter page...');
      }
      finalVrfToken = await getVrfTokenFromChapterPage(chapterUrl);

      if (finalVrfToken) {
        setVrfToken(finalVrfToken); // Store for future use
      }
    }

    // Step 2: Load the chapter page to get the chapter ID
    const chapterId = await getChapterIdFromPage(chapterUrl);

    if (!chapterId) {
      throw new Error(
        `Could not extract chapter ID from chapter page: ${chapterUrl}`
      );
    }

    if (isDebugEnabled()) {
      console.log(
        'Successfully extracted chapter ID:',
        chapterId,
        'from URL:',
        chapterUrl
      );
    }

    // Step 3: Now call the API with the extracted chapter ID and VRF token
    const result = await fetchChapterImages(
      chapterId,
      finalVrfToken || undefined,
      chapterUrl
    );

    if (isDebugEnabled()) {
      log.info('Service', 'fetchChapterImagesFromUrl:success', {
        chapterUrl,
        chapterId,
        imageCount: result.images.length,
        hasVrfToken: !!finalVrfToken,
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
  vrfToken?: string,
  refererUrl?: string
): Promise<{ images: string[][]; status: number }> => {
  if (!chapterId || chapterId.trim().length === 0) {
    throw new Error('Chapter ID is required');
  }

  const log = logger();
  if (isDebugEnabled())
    log.info('Service', 'fetchChapterImages:start', { chapterId });

  const result = await performanceMonitor.measureAsync(
    `fetchChapterImages:${chapterId}`,
    () =>
      retryApiCall(async () => {
        let apiUrl = `${MANGA_API_URL}/ajax/read/chapter/${chapterId.trim()}`;

        // Add VRF token if provided or from session store
        const tokenToUse = vrfToken || sessionVrfToken || '';
        if (tokenToUse) {
          apiUrl += `?vrf=${encodeURIComponent(tokenToUse)}`;
        }

        if (isDebugEnabled()) {
          console.log('Making API request to:', apiUrl);
        }

        if (!validateUrl(apiUrl)) {
          throw new Error('Invalid chapter API URL');
        }

        const response = await axios.get(apiUrl, {
          headers: {
            Accept: 'application/json, text/javascript, */*; q=0.01',
            'Accept-Language': 'en-US,en;q=0.9',
            Priority: 'u=1, i',
            Referer: refererUrl
              ? `${MANGA_API_URL}${refererUrl}`
              : MANGA_API_URL,
            'Sec-Ch-Ua':
              '"Microsoft Edge";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': USER_AGENT,
            'X-Requested-With': 'XMLHttpRequest',
          },
          timeout: 20000,
        });

        if (isDebugEnabled()) {
          console.log('API response status:', response.status);
          console.log('API response data type:', typeof response.data);
        }

        if (!response.data) {
          throw new Error('Invalid response data');
        }

        const data = response.data;

        if (isDebugEnabled()) {
          console.log('API response structure:', {
            hasStatus: 'status' in data,
            status: data.status,
            hasResult: 'result' in data,
            hasImages: data.result && 'images' in data.result,
            imageCount: data.result?.images?.length || 0,
          });
        }

        if (data.status !== 200) {
          throw new Error(
            `API returned status ${data.status}. Response: ${JSON.stringify(data)}`
          );
        }

        if (
          !data.result ||
          !data.result.images ||
          !Array.isArray(data.result.images)
        ) {
          throw new Error(
            `Invalid image data in response. Structure: ${JSON.stringify(data)}`
          );
        }

        if (data.result.images.length === 0) {
          throw new Error('No images found in API response');
        }

        if (isDebugEnabled()) {
          log.info('Service', 'fetchChapterImages:success', {
            chapterId,
            imageCount: data.result.images.length,
            firstImageSample: data.result.images[0],
          });
        }

        return {
          images: data.result.images,
          status: data.status,
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

// Helper function to extract chapter ID from chapter URL
export const extractChapterIdFromUrl = (chapterUrl: string): string | null => {
  try {
    // Extract chapter ID from URLs like: /read/manga-id/en/chapter-123
    // The chapter ID should be extracted from the actual chapter page HTML or API
    // For now, we'll need to make a request to get the chapter ID
    const urlParts = chapterUrl.split('/');
    const chapterPart = urlParts[urlParts.length - 1]; // e.g., "chapter-123"

    if (chapterPart && chapterPart.startsWith('chapter-')) {
      // This is a simplified approach - in reality, we need to get the actual chapter ID
      // from the chapter page HTML or through another API call
      return null; // Will need to be implemented based on actual chapter page structure
    }

    return null;
  } catch (error) {
    console.error('Error extracting chapter ID from URL:', error);
    return null;
  }
};

// Function to extract VRF token from HTML
export const extractVrfTokenFromHtml = (html: string): string | null => {
  try {
    // Multiple patterns to find VRF token
    const vrfPatterns = [
      /vrf['":\s]*['"]*([a-zA-Z0-9+/=]+)['"]*(?!\w)/gi,
      /"vrf"['":\s]*['"]*([a-zA-Z0-9+/=]+)['"]*(?!\w)/gi,
      /data-vrf['":\s]*['"]*([a-zA-Z0-9+/=]+)['"]*(?!\w)/gi,
      /vrfToken['":\s]*['"]*([a-zA-Z0-9+/=]+)['"]*(?!\w)/gi,
      /vrf_token['":\s]*['"]*([a-zA-Z0-9+/=]+)['"]*(?!\w)/gi,
      // Look for base64-like strings that could be VRF tokens
      /['"](ZBYeRCjYBk0[a-zA-Z0-9+/=]{40,})['"]/gi,
      // Look in script tags
      /var\s+vrf\s*=\s*['"]*([a-zA-Z0-9+/=]+)['"]*(?!\w)/gi,
      /let\s+vrf\s*=\s*['"]*([a-zA-Z0-9+/=]+)['"]*(?!\w)/gi,
      /const\s+vrf\s*=\s*['"]*([a-zA-Z0-9+/=]+)['"]*(?!\w)/gi,
    ];

    for (const pattern of vrfPatterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        if (match[1] && match[1].length > 20) {
          // VRF tokens are typically long
          if (isDebugEnabled()) {
            console.log('VRF token found:', match[1].substring(0, 20) + '...');
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
          console.log(
            'Using longest base64 string as VRF token:',
            longestMatch.substring(0, 20) + '...'
          );
        }
        return longestMatch;
      }
    }

    return null;
  } catch (error) {
    console.error('Error extracting VRF token:', error);
    return null;
  }
};

// Function to get chapter ID by loading the chapter page and extracting it
export const getChapterIdFromPage = async (
  chapterUrl: string
): Promise<string | null> => {
  try {
    const fullUrl = chapterUrl.startsWith('http')
      ? chapterUrl
      : `${MANGA_API_URL}${chapterUrl}`;

    if (isDebugEnabled()) {
      console.log('Fetching chapter page:', fullUrl);
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
      console.log('Received HTML length:', html.length);
    }

    // Extract and store VRF token for later use
    const vrfToken = extractVrfTokenFromHtml(html);
    if (vrfToken) {
      setVrfToken(vrfToken);
      if (isDebugEnabled()) {
        console.log('VRF token extracted and stored');
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
            console.log(
              'Extracted chapter ID:',
              match[1],
              'using pattern:',
              pattern.source,
              'from URL:',
              chapterUrl
            );
          }
          return match[1];
        }
      }
    }

    // Fallback: look for script tags that might contain the chapter ID
    const scriptMatches = html.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
    if (scriptMatches) {
      for (const script of scriptMatches) {
        // Look for numeric IDs in script content
        const scriptIdMatches = script.match(/\b(\d{6,8})\b/g);
        if (scriptIdMatches) {
          for (const id of scriptIdMatches) {
            // Skip obviously wrong IDs (like timestamps, years, etc.)
            const numId = parseInt(id);
            if (numId > 1000000 && numId < 99999999) {
              // Reasonable range for chapter IDs
              if (isDebugEnabled()) {
                console.log(
                  'Using fallback chapter ID from script:',
                  id,
                  'from URL:',
                  chapterUrl
                );
              }
              return id;
            }
          }
        }
      }
    }

    // Last resort: look for any reasonable numeric ID in the HTML
    const numericIds = html.match(/\b\d{6,8}\b/g); // Look for 6-8 digit numbers
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
          console.log(
            'Using heuristic chapter ID:',
            filteredIds[0],
            'from URL:',
            chapterUrl
          );
        }
        return filteredIds[0] || null;
      }
    }

    console.warn('Could not extract chapter ID from page:', chapterUrl);
    if (isDebugEnabled()) {
      // Log a sample of the HTML for debugging
      console.log('HTML sample (first 1000 chars):', html.substring(0, 1000));
    }
    return null;
  } catch (error) {
    console.error('Error getting chapter ID from page:', error);
    return null;
  }
};

// Utility function to test if the API endpoint is accessible
export const testApiEndpoint = async (): Promise<boolean> => {
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
    console.error('API endpoint test failed:', error);
    return false;
  }
};

// Utility function to extract chapter info from URL for debugging
export const parseChapterUrl = (
  chapterUrl: string
): { mangaId?: string; chapterNumber?: string } => {
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
    console.error('Error parsing chapter URL:', error);
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
    console.log(
      `Starting batch fetch for ${chapterUrls.length} chapters with max ${maxConcurrent} concurrent requests`
    );
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
    console.log(
      `Batch fetch completed: ${successful} successful, ${failed} failed`
    );
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
            console.warn('Error removing element:', selector, e);
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
            console.warn('Error hiding element:', selector, e);
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
          console.warn('Error adjusting background:', e);
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
          console.warn('Error setting up script blocker:', e);
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
          console.warn('Error disabling popups:', e);
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
        console.warn('Error setting up mutation observer:', e);
      }

      return true;
    })();
  `;
};
