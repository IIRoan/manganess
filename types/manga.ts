// Contains all manga-related types
import { DownloadProgress } from './download';

export interface MangaItem {
  id: string;
  title: string;
  banner: string;
  imageUrl: string;
  link: string;
  type: string;
  rank?: number;
}

export interface MangaDetails {
  id: string;
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
  chapters: Chapter[];
  totalChapters?: number;
  /** Provider type label, e.g. manga / manhwa / manhua. */
  type?: string;
  /**
   * Offline chapter-list pagination. When hasMore is false the list is durable
   * and should not be re-crawled on every open (e.g. One Piece).
   */
  chapterPagination?: {
    nextPage: number;
    hasMore: boolean;
    lastPage?: number;
  };
}

export interface Chapter {
  number: string;
  title: string;
  date: string;
  url: string;
  /** MangaFire scan source when known — used for prefer-official merges. */
  sourceType?: string;
}

export interface ChapterExtended extends Chapter {
  isDownloaded: boolean;
  downloadStatus?: DownloadProgress;
  downloadSize?: number;
}

export interface BookmarkItem {
  id: string;
  title: string;
  status: string;
  lastReadChapter: string;
  imageUrl: string;
  lastUpdated?: number;
}

export type BookmarkStatus = 'To Read' | 'Reading' | 'Read' | 'On Hold';

export interface RecentMangaItem {
  id: string;
  title: string;
  bannerImage: string;
  lastReadChapter?: string;
}

export interface MangaHeaderSnapshot {
  id: string;
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
  totalChapters?: number;
  type?: string;
}

export interface MangaData {
  id: string;
  title: string;
  bannerImage: string;
  bookmarkStatus: BookmarkStatus | null;
  readChapters: string[];
  lastReadChapter?: string;
  lastNotifiedChapter?: string;
  lastUpdated: number;
  totalChapters?: number;
  description?: string;
  alternativeTitle?: string;
  status?: string;
  author?: string[];
  published?: string;
  genres?: string[];
  rating?: string;
  reviewCount?: string;
  type?: string;
  // Download-related fields
  downloadedChapters?: string[];
  downloadStatus?: Record<string, DownloadProgress>;
  totalDownloadSize?: number;
  /**
   * When true, hide half-chapters / extras (3.1, 3.5, …) from the chapter list.
   * Default false — show every unique chapter number.
   */
  hideExtraChapters?: boolean;
}

export interface MangaDataExtended extends MangaData {
  downloadedChapters: string[];
  downloadStatus: Record<string, DownloadProgress>;
  totalDownloadSize: number;
}
