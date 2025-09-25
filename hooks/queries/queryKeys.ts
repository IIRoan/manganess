export const queryKeys = {
  home: ['home'] as const,
  recentlyRead: {
    list: (limit: number) => ['recently-read', limit] as const,
  },
  genres: (slug: string) => ['genre', slug] as const,
  search: (query: string) => ['search', query] as const,
  manga: {
    details: (id: string) => ['manga', id, 'details'] as const,
    bookmark: (id: string) => ['manga', id, 'bookmark'] as const,
    readChapters: (id: string) => ['manga', id, 'readChapters'] as const,
    lastRead: (id: string) => ['manga', id, 'lastRead'] as const,
  },
  anilist: {
    search: (title: string) => ['anilist', 'search', title] as const,
  },
  bookmarks: {
    all: ['bookmarks'] as const,
  },
} as const;
