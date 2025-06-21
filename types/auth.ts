// Contains all authentication-related types

export interface AniListAuthData {
  accessToken: string;
  expiresAt: number;
  lastUpdated: number;
}

export interface AnilistManga {
  id: number;
  title: {
    romaji: string;
    english: string;
    native: string;
  };
}
