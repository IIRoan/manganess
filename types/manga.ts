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
}

export interface Chapter {
  number: string;
  title: string;
  date: string;
  url: string;
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
  // Download-related fields
  downloadedChapters?: string[];
  downloadStatus?: Record<string, DownloadProgress>;
  totalDownloadSize?: number;
}

export interface MangaDataExtended extends MangaData {
  downloadedChapters: string[];
  downloadStatus: Record<string, DownloadProgress>;
  totalDownloadSize: number;
}
