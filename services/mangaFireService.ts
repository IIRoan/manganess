// mangaFireService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { decode } from 'html-entities';

export interface MangaItem {
  id: string;
  title: string;
  banner: string;
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

const BASE_URL = 'https://mangafire.to';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0';

export const searchManga = async (keyword: string): Promise<MangaItem[]> => {
  try {
    const response = await axios.get(`${BASE_URL}/filter?keyword=${encodeURIComponent(keyword)}`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    const html = response.data;
    const mangaRegex = /<div class="unit item-\d+">.*?<a href="(\/manga\/[^"]+)".*?<img src="([^"]+)".*?<span class="type">([^<]+)<\/span>.*?<a href="\/manga\/[^"]+">([^<]+)<\/a>/gs;
    const matches = [...html.matchAll(mangaRegex)];

    return matches.map(match => {
      const link = match[1];
      const id = link.split('/').pop() || '';
      return {
        id,
        link: `${BASE_URL}${link}`,
        title: match[4].trim(),
        banner: match[2],
        type: match[3].trim(),
      };
    });
  } catch (error) {
    console.error('Error searching manga:', error);
    throw error;
  }
};

export const fetchMangaDetails = async (id: string): Promise<MangaDetails> => {
  try {
    const response = await axios.get(`${BASE_URL}/manga/${id}`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
    });

    const html = response.data;
    return parseMangaDetails(html);
  } catch (error) {
    console.error('Error fetching manga details:', error);
    throw error;
  }
};

const parseMangaDetails = (html: string): MangaDetails => {
  const title = html.match(/<h1 itemprop="name">(.*?)<\/h1>/)?.[1] || 'Unknown Title';
  const alternativeTitle = html.match(/<h6>(.*?)<\/h6>/)?.[1] || '';
  const status = html.match(/<p>(.*?)<\/p>/)?.[1] || 'Unknown Status';
  const descriptionMatch = html.match(/<div class="description">(.*?)<\/div>/s);
  const description = descriptionMatch
    ? decode(descriptionMatch[1].replace(/<[^>]*>/g, ''))
    : 'No description available';
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
    return `https://mangafire.to/read/${id}/en/chapter-${chapterNumber}`;
  };
  
  export const markChapterAsRead = async (id: string, chapterNumber: string) => {
    try {
      const key = `manga_${id}_read_chapters`;
      const readChapters = await AsyncStorage.getItem(key) || '[]';
      const chaptersArray = JSON.parse(readChapters);
      if (!chaptersArray.includes(chapterNumber)) {
        chaptersArray.push(chapterNumber);
        await AsyncStorage.setItem(key, JSON.stringify(chaptersArray));
        console.log(`Marked chapter ${chapterNumber} as read for manga ${id}`);
      }
    } catch (error) {
      console.error('Error marking chapter as read:', error);
    }
  };
  
  export const getInjectedJavaScript = () => `
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
    
      // Hide header, footer, and other unwanted elements
      removeElements(['header', 'footer', '.ad-container', '[id^="google_ads_"]', '[id^="adsbygoogle"]', 'iframe[src*="googleads"]', 'iframe[src*="doubleclick"]', '.navbar', '.nav-bar', '#navbar', '#nav-bar', '.top-bar', '#top-bar']);
    
      // Hide toast and other dynamic elements
      hideElements(['#toast', '.toast', '.popup', '.modal', '#overlay', '.overlay', '.banner']);
    
      // Adjust main content
      const main = document.querySelector('main');
      if (main) {
        main.style.paddingTop = '0';
        main.style.marginTop = '0';
      }
    
      // Remove ads and unwanted elements
      function cleanPage() {
        removeElements(['.ad-container', '[id^="google_ads_"]', '[id^="adsbygoogle"]', 'iframe[src*="googleads"]', 'iframe[src*="doubleclick"]']);
        hideElements(['#toast', '.toast', '.popup', '.modal', '#overlay', '.overlay', '.banner']);
      }
    
      // Initial cleaning
      cleanPage();
    
      // Function to force vertical layout
      function forceVerticalLayout() {
        // Reset body and html styles
        document.body.style.width = '100%';
        document.body.style.height = 'auto';
        document.body.style.overflow = 'auto';
        document.documentElement.style.overflow = 'auto';
  
        // Force vertical layout on all potential container elements
        const containers = document.querySelectorAll('body > *, .content-container, .page-container, .image-container');
        containers.forEach(container => {
          container.style.width = '100%';
          container.style.height = 'auto';
          container.style.display = 'block';
          container.style.overflowX = 'hidden';
          container.style.overflowY = 'auto';
          container.style.whiteSpace = 'normal';
          container.style.flexDirection = 'column';
          container.style.alignItems = 'center';
        });
  
        // Adjust all images
        const images = document.querySelectorAll('img');
        images.forEach(img => {
          img.style.maxWidth = '100%';
          img.style.height = 'auto';
          img.style.objectFit = 'contain';
          img.style.display = 'block';
          img.style.marginBottom = '10px';
        });
  
        // Force any horizontal scrollers to be vertical
        const scrollers = document.querySelectorAll('[class*="scroller"], [id*="scroller"]');
        scrollers.forEach(scroller => {
          scroller.style.overflowX = 'hidden';
          scroller.style.overflowY = 'auto';
          scroller.style.whiteSpace = 'normal';
          scroller.style.display = 'block';
          scroller.style.width = '100%';
          scroller.style.height = 'auto';
        });
      }
  
      // Initial layout adjustment
      forceVerticalLayout();
    
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
    
      // Prevent default zoom behavior
      document.addEventListener('gesturestart', function(e) {
        e.preventDefault();
      });
    
      // Disable text selection
      document.body.style.webkitTouchCallout = 'none';
      document.body.style.webkitUserSelect = 'none';
      document.body.style.khtmlUserSelect = 'none';
      document.body.style.mozUserSelect = 'none';
      document.body.style.msUserSelect = 'none';
      document.body.style.userSelect = 'none';
    
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