import axios from 'axios';
import type { Chapter, MangaDetails, MangaItem } from '@/types/manga';
import {
  REQUEST_HUB_TTLS,
  scheduleMangaFireRequest,
} from '@/services/mangaFireRequestHub';
import { sourceMangaId, type MangaSource } from './types';

const ORIGIN = 'https://www.azuki.com';
const SOURCE_ID = 'azuki';
/** azuki.com publishes a single series. */
const SERIES_KEY = 'azuki';
const TITLE = 'Azuki';
const DESCRIPTION =
  'Read Azuki Manga and explore the story, characters, and world of the Garden from creator Arnold Tsang.';

interface AzukiPanel {
  pageNumber: number;
  imageUrl: string;
  mobileImageUrl?: string;
}

interface AzukiChapter {
  chapterNumber: number;
  title?: string;
  status?: string;
  publishedAt?: string;
  mobileThumbnailImageUrl?: string;
  panels?: AzukiPanel[];
}

interface AzukiReaderProps {
  /** Every chapter, without panels. */
  chapters: AzukiChapter[];
  /** Chapters around the requested one, with panels. */
  initialChapters: AzukiChapter[];
}

/** The reader is a server-rendered Next.js page: chapters and panel URLs are embedded as JSON. */
export function parseAzukiReaderHtml(html: string): AzukiReaderProps {
  const json = html.match(
    /<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/
  )?.[1];
  if (!json) {
    throw new Error('Azuki reader page has no __NEXT_DATA__');
  }

  const props = JSON.parse(json)?.props?.pageProps;
  if (!Array.isArray(props?.chapters)) {
    throw new Error('Azuki reader page has no chapter list');
  }

  return {
    chapters: props.chapters,
    initialChapters: Array.isArray(props.initialChapters)
      ? props.initialChapters
      : [],
  };
}

function fetchReaderPage(chapterNumber: string): Promise<AzukiReaderProps> {
  return scheduleMangaFireRequest(
    `azuki:read:${chapterNumber}`,
    async () => {
      const { data } = await axios.get<string>(
        `${ORIGIN}/manga/read/${encodeURIComponent(chapterNumber)}`,
        { responseType: 'text', timeout: 15000 }
      );
      return parseAzukiReaderHtml(data);
    },
    { ttlMs: REQUEST_HUB_TTLS.chapters }
  );
}

function assertSeriesKey(key: string): void {
  if (key !== SERIES_KEY) {
    throw new Error(`Unknown Azuki series: ${key}`);
  }
}

function coverOf(chapters: AzukiChapter[]): string {
  return (
    chapters.find((chapter) => chapter.chapterNumber === 1)
      ?.mobileThumbnailImageUrl ?? ''
  );
}

export function mapAzukiChapters(chapters: AzukiChapter[]): Chapter[] {
  return chapters
    .filter((chapter) => !chapter.status || chapter.status === 'PUBLISHED')
    .sort((a, b) => b.chapterNumber - a.chapterNumber)
    .map((chapter) => {
      const number = String(chapter.chapterNumber);
      const name = chapter.title?.trim();
      return {
        number,
        title: name ? `Chapter ${number}: ${name}` : `Chapter ${number}`,
        date: chapter.publishedAt
          ? new Date(chapter.publishedAt).toLocaleDateString()
          : '',
        url: `${ORIGIN}/manga/read/${number}`,
      };
    });
}

export const azukiSource: MangaSource = {
  id: SOURCE_ID,
  name: 'Azuki',
  website: 'azuki.com',

  async search(query) {
    const q = query.trim().toLowerCase();
    if (!TITLE.toLowerCase().includes(q) && !q.includes('azuki')) {
      return [];
    }

    const { chapters } = await fetchReaderPage('1');
    const cover = coverOf(chapters);
    const item: MangaItem = {
      id: sourceMangaId(SOURCE_ID, SERIES_KEY),
      title: TITLE,
      banner: cover,
      imageUrl: cover,
      link: `${ORIGIN}/manga`,
      type: 'Manga',
    };
    return [item];
  },

  async fetchDetails(key) {
    assertSeriesKey(key);
    const { chapters } = await fetchReaderPage('1');
    const mapped = mapAzukiChapters(chapters);
    const details: MangaDetails = {
      id: sourceMangaId(SOURCE_ID, SERIES_KEY),
      title: TITLE,
      alternativeTitle: '',
      status: 'Ongoing',
      description: DESCRIPTION,
      author: ['Arnold Tsang'],
      published: chapters[0]?.publishedAt?.slice(0, 4) ?? 'Unknown',
      genres: [],
      rating: 'N/A',
      reviewCount: '0',
      bannerImage: coverOf(chapters),
      chapters: mapped,
      totalChapters: mapped.length,
      type: 'Manga',
    };
    return details;
  },

  async fetchChapterPages(key, chapterNumber) {
    assertSeriesKey(key);
    const { initialChapters } = await fetchReaderPage(chapterNumber);
    const chapter = initialChapters.find(
      (candidate) => String(candidate.chapterNumber) === chapterNumber
    );
    const panels = [...(chapter?.panels ?? [])].sort(
      (a, b) => a.pageNumber - b.pageNumber
    );
    if (!panels.length) {
      throw new Error(`Azuki chapter ${chapterNumber} not found`);
    }
    // Mobile renditions are ~170KB JPEGs; the originals are multi-MB PNGs.
    return panels.map((panel) => panel.mobileImageUrl || panel.imageUrl);
  },
};
