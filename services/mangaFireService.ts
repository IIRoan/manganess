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
  return (
    lowered.includes('cf-browser-verification') ||
    lowered.includes('cf_captcha_kind') ||
    lowered.includes('just a moment') ||
    lowered.includes('cloudflare')
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

export const searchManga = async (keyword: string): Promise<MangaItem[]> => {
  if (!keyword || keyword.trim().length === 0) {
    throw new Error('Search keyword is required');
  }

  return performanceMonitor.measureAsync(`searchManga:${keyword}`, () =>
    retryApiCall(async () => {
      const searchUrl = `${MANGA_API_URL}/filter?keyword=${encodeURIComponent(keyword.trim())}`;

      if (!validateUrl(searchUrl)) {
        throw new Error('Invalid search URL');
      }

      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': MANGA_API_URL,
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
      return parseSearchResults(html);
    })
  );
};

// Extract search result parsing into separate function
function parseSearchResults(html: string): MangaItem[] {
  const mangaRegex =
    /<div class="unit item-\d+">.*?<a href="(\/manga\/[^"]+)".*?<img src="([^"]+)".*?<span class="type">([^<]+)<\/span>.*?<a href="\/manga\/[^"]+">([^<]+)<\/a>/gs;
  const matches = [...html.matchAll(mangaRegex)];

  return matches
    .map((match) => {
      const link = match[1];
      const id = link ? link.split('/').pop() || '' : '';
      const imageUrl = match[2];

      // Validate image URL
      const validImageUrl = validateUrl(imageUrl || '') ? imageUrl : '';

      return {
        id,
        link: `${MANGA_API_URL}${link || ''}`,
        title: decode(match[4]?.trim() || ''),
        banner: validImageUrl || '',
        imageUrl: validImageUrl || '',
        type: decode(match[3]?.trim() || ''),
      };
    })
    .filter((item) => item.id && item.title); // Filter out incomplete results
}

export const fetchMangaDetails = async (id: string): Promise<MangaDetails> => {
  if (!id || id.trim().length === 0) {
    throw new Error('Manga ID is required');
  }

  return performanceMonitor.measureAsync(`fetchMangaDetails:${id}`, () =>
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
    chapters: chapters.filter(ch => ch.number && ch.url && ch.date),
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

  console.log('Could not find "New Release" section');
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

// Generate JavaScript injection code for cleaning up web content
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
