import { RECENT_MANGA_HEADER_CACHE_LIMIT } from '@/constants/mangaCache';
import type { MangaData } from '@/types/manga';
import {
  applyHeaderToMangaData,
  areCachedMangaHeadersEquivalent,
  extractMangaHeader,
  hasLoadedMangaHeader,
  pruneMangaHeaderCache,
  type CachedMangaHeader,
} from '../mangaHeader';

function header(
  id: string,
  overrides: Partial<CachedMangaHeader> = {}
): CachedMangaHeader {
  return {
    id,
    title: `Title ${id}`,
    alternativeTitle: '',
    status: 'Ongoing',
    description: `Synopsis ${id}`,
    author: ['Author'],
    published: '2024',
    genres: ['Action'],
    rating: '8',
    reviewCount: '10',
    bannerImage: `https://example.com/${id}.jpg`,
    cachedAt: 1,
    lastOpenedAt: 1,
    isBookmarked: false,
    ...overrides,
  };
}

describe('mangaHeader', () => {
  describe('areCachedMangaHeadersEquivalent', () => {
    it('ignores cachedAt and lastOpenedAt', () => {
      expect(
        areCachedMangaHeadersEquivalent(
          header('abc12', { cachedAt: 1, lastOpenedAt: 1 }),
          header('abc12', { cachedAt: 99, lastOpenedAt: 100 })
        )
      ).toBe(true);
    });

    it('treats bookmark and description changes as different', () => {
      expect(
        areCachedMangaHeadersEquivalent(
          header('abc12'),
          header('abc12', { isBookmarked: true })
        )
      ).toBe(false);
      expect(
        areCachedMangaHeadersEquivalent(
          header('abc12'),
          header('abc12', { description: 'Changed' })
        )
      ).toBe(false);
    });
  });

  describe('hasLoadedMangaHeader', () => {
    it('requires a non-empty description', () => {
      expect(hasLoadedMangaHeader({ description: '' })).toBe(false);
      expect(hasLoadedMangaHeader({ description: '   ' })).toBe(false);
      expect(
        hasLoadedMangaHeader({ description: 'A wandering swordsman.' })
      ).toBe(true);
    });
  });

  describe('extractMangaHeader', () => {
    it('copies title metadata without chapters', () => {
      const snapshot = extractMangaHeader(
        {
          id: 'abc12',
          title: 'One Piece',
          alternativeTitle: 'OP',
          status: 'Ongoing',
          description: 'Pirates',
          author: ['Oda'],
          published: '1997',
          genres: ['Adventure'],
          rating: '9.5',
          reviewCount: '1000',
          bannerImage: 'https://example.com/op.jpg',
          totalChapters: 1100,
        },
        'abc12'
      );

      expect(snapshot).toMatchObject({
        id: 'abc12',
        title: 'One Piece',
        description: 'Pirates',
        totalChapters: 1100,
      });
      expect(snapshot).not.toHaveProperty('chapters');
    });

    it('omits a placeholder total of 0', () => {
      const snapshot = extractMangaHeader(
        {
          id: 'abc12',
          title: 'One Piece',
          alternativeTitle: '',
          status: '',
          description: '',
          author: [],
          published: '',
          genres: [],
          rating: '',
          reviewCount: '',
          bannerImage: '',
          totalChapters: 0,
        },
        'abc12'
      );

      expect(snapshot).not.toHaveProperty('totalChapters');
    });
  });

  describe('applyHeaderToMangaData', () => {
    it('keeps an existing description when incoming details are title-only', () => {
      const existing: MangaData = {
        id: 'abc12',
        title: 'Old',
        bannerImage: 'old.jpg',
        bookmarkStatus: 'Reading',
        readChapters: ['1'],
        lastUpdated: 1,
        description: 'Saved synopsis',
      };

      const next = applyHeaderToMangaData(
        existing,
        extractMangaHeader(
          {
            id: 'abc12',
            title: 'Updated',
            alternativeTitle: '',
            status: '',
            description: '',
            author: [],
            published: '',
            genres: [],
            rating: '',
            reviewCount: '',
            bannerImage: 'new.jpg',
          },
          'abc12'
        )
      );

      expect(next.title).toBe('Updated');
      expect(next.description).toBe('Saved synopsis');
      expect(next.bannerImage).toBe('new.jpg');
    });

    it('does not overwrite a stored chapter total with 0', () => {
      const existing: MangaData = {
        id: 'abc12',
        title: 'One Piece',
        bannerImage: 'cover.jpg',
        bookmarkStatus: 'Reading',
        readChapters: [],
        lastUpdated: 1,
        totalChapters: 1190,
      };

      const next = applyHeaderToMangaData(
        existing,
        extractMangaHeader(
          {
            id: 'abc12',
            title: 'One Piece',
            alternativeTitle: '',
            status: '',
            description: '',
            author: [],
            published: '',
            genres: [],
            rating: '',
            reviewCount: '',
            bannerImage: 'cover.jpg',
            totalChapters: 0,
          },
          'abc12'
        )
      );

      expect(next.totalChapters).toBe(1190);
    });
  });

  describe('pruneMangaHeaderCache', () => {
    it('keeps bookmarked headers and the most recently opened titles', () => {
      const cache: Record<string, CachedMangaHeader> = {};
      cache.book1 = header('book1', {
        isBookmarked: true,
        lastOpenedAt: 1,
      });

      for (
        let index = 0;
        index < RECENT_MANGA_HEADER_CACHE_LIMIT + 5;
        index += 1
      ) {
        const id = `recent-${index}`;
        cache[id] = header(id, { lastOpenedAt: index + 10 });
      }

      const pruned = pruneMangaHeaderCache(cache);

      expect(pruned.book1).toBeDefined();
      expect(
        Object.values(pruned).filter((entry) => !entry.isBookmarked)
      ).toHaveLength(RECENT_MANGA_HEADER_CACHE_LIMIT);
      expect(pruned['recent-0']).toBeUndefined();
      expect(
        pruned[`recent-${RECENT_MANGA_HEADER_CACHE_LIMIT + 4}`]
      ).toBeDefined();
    });
  });
});
