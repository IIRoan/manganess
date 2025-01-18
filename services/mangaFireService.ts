import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { decode } from 'html-entities';
import { MANGA_API_URL } from '@/constants/Config';
import { searchAnilistMangaByName, updateMangaStatus, isLoggedInToAniList } from '@/services/anilistService';

type MangaType = 'Manga' | 'One-Shot' | 'Doujinshi' | 'Novel' | 'Manhwa' | 'Manhua';

export interface MangaItem {
  id: string;
  title: string;
  banner: string;
  imageUrl: string;
  link: string;
  type: MangaType;
  latestChapter?: {
    number: string;
    date: string;
  };
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
    const mangaRegex = /<div class="unit item-\d+">.*?<a href="(\/manga\/[^"]+)".*?<img src="([^"]+)".*?<span class="type">([^<]+)<\/span>.*?<a href="\/manga\/[^"]+">([^<]+)<\/a>.*?(<ul class="content"[^>]*>.*?<\/ul>)?/gs;
    const matches = [...html.matchAll(mangaRegex)];

    return matches.map(match => {
      const link = match[1];
      const id = link.split('/').pop() || '';
      const rawType = decode(match[3].trim());

      // Normalize the type to match our defined types
      let normalizedType: MangaType = 'Manga'; // default type
      switch (rawType.toLowerCase()) {
        case 'manga':
          normalizedType = 'Manga';
          break;
        case 'manhwa':
          normalizedType = 'Manhwa';
          break;
        case 'manhua':
          normalizedType = 'Manhua';
          break;
        case 'novel':
          normalizedType = 'Novel';
          break;
        case 'one_shot':
        case 'one-shot':
          normalizedType = 'One-Shot';
          break;
        case 'doujinshi':
          normalizedType = 'Doujinshi';
          break;
      }

      const mangaItem: MangaItem = {
        id,
        link: `${MANGA_API_URL}${link}`,
        title: decode(match[4].trim()),
        banner: match[2],
        imageUrl: match[2],
        type: normalizedType,
      };

      // Extract latest chapter information if available
      if (match[5]) {
        const chapterListHtml = match[5];
        const latestChapterRegex = /<a href="[^"]+\/chapter-([^"]+)">[^<]*<span>Chap [^<]+ <b>[^<]+<\/b><\/span>\s*<span>([^<]+)<\/span>/;
        const latestChapterMatch = chapterListHtml.match(latestChapterRegex);

        if (latestChapterMatch) {
          mangaItem.latestChapter = {
            number: latestChapterMatch[1],
            date: latestChapterMatch[2].trim()
          };
        }
      }

      return mangaItem;
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

  // Process HTML tags in the description
  description = description
    .replace(/<br\s*\/?>/gi, '\n') // Replace <br> tags with newlines
    .replace(/<p>/gi, '') // Remove opening <p> tags
    .replace(/<\/p>/gi, '\n\n') // Replace closing </p> tags with double newlines
    .replace(/<(?:.|\n)*?>/gm, '') // Remove any remaining HTML tags
    .trim(); // Trim any leading or trailing whitespace



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
    const key = `manga_${id}_read_chapters`;
    const readChapters = await AsyncStorage.getItem(key) || '[]';
    const chaptersArray = JSON.parse(readChapters);
    if (!chaptersArray.includes(chapterNumber)) {
      chaptersArray.push(chapterNumber);
      await AsyncStorage.setItem(key, JSON.stringify(chaptersArray));
      console.log(`Marked chapter ${chapterNumber} as read for manga ${id} (${mangaTitle})`);
    }
  } catch (error) {
    console.error('Error marking chapter as read:', error);
  }
};



export const getBookmarkStatus = async (id: string): Promise<string | null> => {
  try {
    return await AsyncStorage.getItem(`bookmark_${id}`);
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
    // Check if the user is logged in to AniList
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
  // Find all home-swiper sections
  const homeSwiperRegex = /<section class="home-swiper">([\s\S]*?)<\/section>/g;
  const homeSwiperMatches = Array.from(html.matchAll(homeSwiperRegex));

  for (const match of homeSwiperMatches) {
    const swiperContent = match[1];

    // Check if this home-swiper contains the "New Release" heading
    if (swiperContent.includes('<h2>New Release</h2>')) {
      // Extract individual manga items with type and chapter info
      const itemRegex = /<div class="swiper-slide unit[^"]*">\s*<a href="\/manga\/([^"]+)">\s*<div class="poster">\s*<div><img src="([^"]+)" alt="([^"]+)"><\/div>\s*<\/div>\s*<span>([^<]+)<\/span>\s*<\/a>(?:.*?<span class="type">([^<]+)<\/span>)?(?:.*?<ul class="content"[^>]*>(.*?)<\/ul>)?/gs;
      const matches = Array.from(swiperContent.matchAll(itemRegex));

      return matches.map(match => {
        const rawType = match[5] ? decode(match[5].trim()) : 'manga';
        let normalizedType: MangaType = 'Manga';
        
        // Normalize the type
        switch (rawType.toLowerCase()) {
          case 'manhwa': normalizedType = 'Manhwa'; break;
          case 'manhua': normalizedType = 'Manhua'; break;
          case 'novel': normalizedType = 'Novel'; break;
          case 'one_shot':
          case 'one-shot': normalizedType = 'One-Shot'; break;
          case 'doujinshi': normalizedType = 'Doujinshi'; break;
          default: normalizedType = 'Manga';
        }

        const mangaItem: MangaItem = {
          id: match[1],
          imageUrl: match[2],
          title: decode(match[4].trim()),
          banner: '',
          link: `/manga/${match[1]}`,
          type: normalizedType
        };

        // Extract latest chapter if available
        if (match[6]) {
          const chapterRegex = /<a href="[^"]+\/chapter-([^"]+)">[^<]*<span>Chap [^<]+ <b>[^<]+<\/b><\/span>\s*<span>([^<]+)<\/span>/;
          const chapterMatch = match[6].match(chapterRegex);
          if (chapterMatch) {
            mangaItem.latestChapter = {
              number: chapterMatch[1],
              date: chapterMatch[2].trim()
            };
          }
        }

        return mangaItem;
      });
    }
  }

  console.log('Could not find "New Release" section');
  return [];
};

export const parseMostViewedManga = (html: string): MangaItem[] => {
  const regex = /<div class="swiper-slide unit[^>]*>.*?<a href="\/manga\/([^"]+)".*?<b>(\d+)<\/b>.*?<img src="([^"]+)".*?alt="([^"]+)".*?(?:<span class="type">([^<]+)<\/span>)?(?:<ul class="content"[^>]*>(.*?)<\/ul>)?.*?<\/a>/gs;
  const matches = [...html.matchAll(regex)];

  return matches.slice(0, 10).map(match => {
    const rawType = match[5] ? decode(match[5].trim()) : 'manga';
    let normalizedType: MangaType = 'Manga';
    
    // Normalize the type
    switch (rawType.toLowerCase()) {
      case 'manhwa': normalizedType = 'Manhwa'; break;
      case 'manhua': normalizedType = 'Manhua'; break;
      case 'novel': normalizedType = 'Novel'; break;
      case 'one_shot':
      case 'one-shot': normalizedType = 'One-Shot'; break;
      case 'doujinshi': normalizedType = 'Doujinshi'; break;
      default: normalizedType = 'Manga';
    }


    const mangaItem: MangaItem = {
      id: match[1],
      rank: parseInt(match[2]),
      imageUrl: match[3],
      title: decode(match[4]),
      banner: '',
      link: `/manga/${match[1]}`,
      type: normalizedType
    };

    // Extract latest chapter if available
    if (match[6]) {
      const chapterRegex = /<a href="[^"]+\/chapter-([^"]+)">[^<]*<span>Chap [^<]+ <b>[^<]+<\/b><\/span>\s*<span>([^<]+)<\/span>/;
      const chapterMatch = match[6].match(chapterRegex);
      if (chapterMatch) {
        mangaItem.latestChapter = {
          number: chapterMatch[1],
          date: chapterMatch[2].trim()
        };
      }
    }

    return mangaItem;
  });
};


export const getInjectedJavaScript = (backgroundColor: string) => `
  (function() {
    // Function to remove elements
    function removeElements(selectors) {
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });
    }

    // Function to hide elements
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

    // Function to remove toast div
    function removeToast() {
      const toastDiv = document.getElementById('toast');
      if (toastDiv) {
        toastDiv.remove();
      }
    }

    // Function to change background and remove background image
    function adjustBackground() {
      const bgSpan = document.querySelector('span.bg');
      if (bgSpan) {
        bgSpan.style.backgroundImage = 'none';
        bgSpan.style.backgroundColor = '${backgroundColor}';
      }
      // Change the body background
      document.body.style.backgroundImage = 'none';
      document.body.style.backgroundColor = '${backgroundColor}';
    }

    // Hide header, footer, and other unwanted elements
    removeElements(['header', 'footer', '.ad-container', '[id^="google_ads_"]', '[id^="adsbygoogle"]', 'iframe[src*="googleads"]', 'iframe[src*="doubleclick"]', '.navbar', '.nav-bar', '#navbar', '#nav-bar', '.top-bar', '#top-bar']);

    // Hide toast and other dynamic elements
    hideElements(['#toast', '.toast', '.popup', '.modal', '#overlay', '.overlay', '.banner']);

    // Remove ads and unwanted elements
    function cleanPage() {
      removeElements(['.ad-container', '[id^="google_ads_"]', '[id^="adsbygoogle"]', 'iframe[src*="googleads"]', 'iframe[src*="doubleclick"]']);
      hideElements(['#toast', '.toast', '.popup', '.modal', '#overlay', '.overlay', '.banner']);
      removeToast();
      adjustBackground();
    }
    // Initial cleaning and background adjustment
    cleanPage();

    // Set up a MutationObserver to remove ads and popups that might be dynamically added
    const observer = new MutationObserver(cleanPage);
    observer.observe(document.body, { childList: true, subtree: true });

    // Prevent popups and new window opening
    window.open = function() { return null; };
    window.alert = function() { return null; };
    window.confirm = function() { return null; };
    window.prompt = function() { return null; };

    // Function to handle navigation
    function handleNavigation(e) {
      const target = e.target.closest('.number-nav a');
      if (target) {
        e.stopPropagation();
        // Allow the default action for these buttons
        return true;
      }
      // Prevent default for all other clicks
      e.preventDefault();
      e.stopPropagation();
      return false;
    }


    // Block common tracking and ad scripts
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

    true; // This is required for the injected JavaScript to work
  })();
`;