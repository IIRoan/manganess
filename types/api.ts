// Contains API response and request types

export interface MangaMappingData {
  internalId: string;
  anilistId: number;
  title: string;
  lastUpdated: number;
}

export interface LastReadChapters {
  [key: string]: string | null;
}

export interface ServiceResponse<T> {
  success: boolean;
  message: string;
  data?: T;
}

export interface CacheInfo {
  size: number;
  count: number;
}
