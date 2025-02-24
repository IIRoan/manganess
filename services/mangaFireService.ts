import axios from 'axios';
import { decode } from 'html-entities';
import { MANGA_API_URL } from '@/constants/Config';
import { searchAnilistMangaByName, updateMangaStatus, isLoggedInToAniList } from '@/services/anilistService';
import { getMangaData, setMangaData } from '@/services/bookmarkService';

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
  chapters: Array<{ number: string; title: string; date: string; url: string }>;
}

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';

export const searchManga = async (keyword: string): Promise<MangaItem[]> => {
  try {
    const response = await axios.get(`${MANGA_API_URL}/filter?keyword=${encodeURIComponent(keyword)}`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    const html = response.data as string;
    const mangaRegex = /<div class="unit item-\d+">.*?<a href="(\/manga\/[^"]+)".*?<img src="([^"]+)".*?<span class="type">([^<]+)<\/span>.*?<a href="\/manga\/[^"]+">([^<]+)<\/a>/gs;
    const matches = [...html.matchAll(mangaRegex)];

    return matches.map(match => {
      const link = match[1];
      const id = link.split('/').pop() || '';
      return {
        id,
        link: `${MANGA_API_URL}${link}`,
        title: decode(match[4].trim()),
        banner: match[2],
        imageUrl: match[2],
        type: decode(match[3].trim()),
      };
    });
  } catch (error) {
    console.error('Error searching manga:', error);
    throw error;
  }
};

export const fetchMangaDetails = async (id: string): Promise<MangaDetails> => {
  try {
    const response = await axios.get(`${MANGA_API_URL}/manga/${id}`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    const html = response.data as string;
    return parseMangaDetails(html);
  } catch (error) {
    console.error('Error fetching manga details:', error);
    throw error;
  }
};

const parseMangaDetails = (html: string): MangaDetails => {
  const title = decode(html.match(/<h1 itemprop="name">(.*?)<\/h1>/)?.[1] || 'Unknown Title');
  const alternativeTitle = decode(html.match(/<h6>(.*?)<\/h6>/)?.[1] || '');
  const status = html.match(/<p>(.*?)<\/p>/)?.[1] || 'Unknown Status';

  const descriptionMatch = html.match(/<div class="modal fade" id="synopsis">[\s\S]*?<div class="modal-content p-4">\s*<div class="modal-close"[^>]*>[\s\S]*?<\/div>\s*([\s\S]*?)\s*<\/div>/);
  let description = descriptionMatch
    ? decode(descriptionMatch[1].trim()) || 'No description available'
    : 'No description available';

  description = description
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p>/gi, '')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<(?:.|\n)*?>/gm, '')
    .trim();

  const authorMatch = html.match(/<span>Author:<\/span>.*?<span>(.*?)<\/span>/s);
  const authors = authorMatch ? authorMatch[1].match(/<a[^>]*>(.*?)<\/a>/g)?.map(a => a.replace(/<[^>]*>/g, '')) || [] : [];

  const published = html.match(/<span>Published:<\/span>.*?<span>(.*?)<\/span>/s)?.[1] || 'Unknown';

  const genresMatch = html.match(/<span>Genres:<\/span>.*?<span>(.*?)<\/span>/s);
  const genres = genresMatch ? genresMatch[1].match(/<a[^>]*>(.*?)<\/a>/g)?.map(a => a.replace(/<[^>]*>/g, '')) || [] : [];

  const rating = html.match(/<span class="live-score" itemprop="ratingValue">(.*?)<\/span>/)?.[1] || 'N/A';
  const reviewCount = html.match(/<span itemprop="reviewCount".*?>(.*?)<\/span>/)?.[1] || '0';
  const bannerImageMatch = html.match(/<div class="poster">.*?<img src="(.*?)" itemprop="image"/s);
  const bannerImage = bannerImageMatch ? bannerImageMatch[1] : '';

  const chaptersRegex = /<li class="item".*?<a href="(.*?)".*?<span>Chapter (\d+):.*?<\/span>.*?<span>(.*?)<\/span>/g;
  const chapters = [];
  let match;
  while ((match = chaptersRegex.exec(html)) !== null) {
    chapters.push({
      url: match[1],
      number: match[2],
      title: `Chapter ${match[2]}`,
      date: match[3],
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
    bannerImage,
    chapters,
  };
};

export const getChapterUrl = (id: string, chapterNumber: string): string => {
  return `${MANGA_API_URL}/read/${id}/en/chapter-${chapterNumber}`;
};

export const markChapterAsRead = async (id: string, chapterNumber: string, mangaTitle: string) => {
  if (!id || !chapterNumber || !mangaTitle) {
    console.error('Invalid parameters for markChapterAsRead:', { id, chapterNumber, mangaTitle });
    return;
  }

  try {
    const mangaData = await getMangaData(id);
    if (mangaData) {
      const updatedReadChapters = Array.from(
        new Set([...mangaData.readChapters, chapterNumber])
      );
      const highestChapter = Math.max(...updatedReadChapters.map(ch => parseFloat(ch))).toString();
      await setMangaData({
        ...mangaData,
        readChapters: updatedReadChapters,
        lastReadChapter: highestChapter,
        lastUpdated: Date.now()
      });
      console.log(`Marked chapter ${chapterNumber} as read for manga ${id} (${mangaTitle})`);
    } else {
      // Create new manga data if it doesn't exist
      await setMangaData({
        id,
        title: mangaTitle,
        bannerImage: '',
        bookmarkStatus: null,
        readChapters: [chapterNumber],
        lastReadChapter: chapterNumber,
        lastUpdated: Date.now()
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

export const updateAniListProgress = async (id: string, mangaTitle: string, progress: number, bookmarkStatus: string) => {
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
        case "To Read":
          status = "PLANNING";
          break;
        case "Reading":
          status = "CURRENT";
          break;
        case "Read":
          status = "COMPLETED";
          break;
        default:
          status = "CURRENT";
      }
      await updateMangaStatus(anilistManga.id, status, progress);
      console.log(`Updated AniList progress for "${mangaTitle}" (${id}) to ${progress} chapters with status ${status}`);
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

    if (swiperContent.includes('<h2>New Release</h2>')) {
      const itemRegex = /<div class="swiper-slide unit[^"]*">\s*<a href="\/manga\/([^"]+)">\s*<div class="poster">\s*<div><img src="([^"]+)" alt="([^"]+)"><\/div>\s*<\/div>\s*<span>([^<]+)<\/span>\s*<\/a>\s*<\/div>/g;
      const matches = Array.from(swiperContent.matchAll(itemRegex));

      return matches.map(match => ({
        id: match[1],
        imageUrl: match[2],
        title: decode(match[4].trim()),
        banner: '',
        link: `/manga/${match[1]}`,
        type: 'manga'
      }));
    }
  }

  console.log('Could not find "New Release" section');
  return [];
};

export const parseMostViewedManga = (html: string): MangaItem[] => {
  const regex = /<div class="swiper-slide unit[^>]*>.*?<a href="\/manga\/([^"]+)".*?<b>(\d+)<\/b>.*?<img src="([^"]+)".*?alt="([^"]+)".*?<\/a>/gs;
  const matches = [...html.matchAll(regex)];
  return matches.slice(0, 10).map(match => ({
    id: match[1],
    rank: parseInt(match[2]),
    imageUrl: match[3],
    title: decode(match[4]),
    banner: '',
    link: `/manga/${match[1]}`,
    type: 'manga'
  }));
};

export const getInjectedJavaScript = (backgroundColor: string) => `
  (function() {
    function removeElements(selectors) {
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });
    }

    function hideElements(selectors) {
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
        });
      });
    }

    function removeToast() {
      const toastDiv = document.getElementById('toast');
      if (toastDiv) {
        toastDiv.remove();
      }
    }

    function adjustBackground() {
      const bgSpan = document.querySelector('span.bg');
      if (bgSpan) {
        bgSpan.style.backgroundImage = 'none';
        bgSpan.style.backgroundColor = '${backgroundColor}';
      }
      document.body.style.backgroundImage = 'none';
      document.body.style.backgroundColor = '${backgroundColor}';
    }

    removeElements(['header', 'footer', '.ad-container', '[id^="google_ads_"]', '[id^="adsbygoogle"]', 'iframe[src*="googleads"]', 'iframe[src*="doubleclick"]', '.navbar', '.nav-bar', '#navbar', '#nav-bar', '.top-bar', '#top-bar']);
    hideElements(['#toast', '.toast', '.popup', '.modal', '#overlay', '.overlay', '.banner']);

    function cleanPage() {
      removeElements(['.ad-container', '[id^="google_ads_"]', '[id^="adsbygoogle"]', 'iframe[src*="googleads"]', 'iframe[src*="doubleclick"]']);
      hideElements(['#toast', '.toast', '.popup', '.modal', '#overlay', '.overlay', '.banner']);
      removeToast();
      adjustBackground();
    }

    cleanPage();

    const observer = new MutationObserver(cleanPage);
    observer.observe(document.body, { childList: true, subtree: true });

    window.open = function() { return null; };
    window.alert = function() { return null; };
    window.confirm = function() { return null; };
    window.prompt = function() { return null; };

    function handleNavigation(e) {
      const target = e.target.closest('.number-nav a');
      if (target) {
        e.stopPropagation();
        return true;
      }
      e.preventDefault();
      e.stopPropagation();
      return false;
    }

    const scriptBlocker = {
      apply: function(target, thisArg, argumentsList) {
        const src = argumentsList[0].src || '';
        if (src.includes('ads') || src.includes('analytics') || src.includes('tracker')) {
          return null;
        }
        return target.apply(thisArg, argumentsList);
      }
    };
    document.createElement = new Proxy(document.createElement, scriptBlocker);

    true;
  })();
`;
