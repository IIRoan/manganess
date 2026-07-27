import type { MangaDetails } from '@/types/manga';
import { mergeMangaDetailsRefresh } from '@/utils/mangaDetailsMerge';

function details(
  overrides: Partial<MangaDetails> & Pick<MangaDetails, 'id'>
): MangaDetails {
  return {
    title: 'Test',
    alternativeTitle: '',
    status: '',
    description: '',
    author: [],
    published: '',
    genres: [],
    rating: '',
    reviewCount: '',
    bannerImage: '',
    chapters: [],
    ...overrides,
  };
}

function chapter(number: string) {
  return {
    number,
    title: `Chapter ${number}`,
    date: '',
    url: `/chapter/${number}`,
  };
}

describe('mergeMangaDetailsRefresh', () => {
  it('uses incoming details when there is no previous state', () => {
    const incoming = details({
      id: 'abc12',
      title: 'Fresh',
      chapters: [chapter('2'), chapter('1')],
      totalChapters: 2,
    });

    expect(mergeMangaDetailsRefresh(null, incoming, 'abc12')).toEqual(incoming);
  });

  it('keeps a longer cached chapter list when background refresh only returns page 1', () => {
    const previous = details({
      id: 'abc12',
      chapters: Array.from({ length: 120 }, (_, index) =>
        chapter(String(120 - index))
      ),
      totalChapters: 2427,
    });
    const incoming = details({
      id: 'abc12',
      title: 'Updated title',
      description: 'New synopsis',
      chapters: Array.from({ length: 60 }, (_, index) =>
        chapter(String(2427 - index))
      ),
      totalChapters: 2427,
    });

    const merged = mergeMangaDetailsRefresh(previous, incoming, 'abc12');

    expect(merged.chapters).toHaveLength(120);
    expect(merged.title).toBe('Updated title');
    expect(merged.description).toBe('New synopsis');
    expect(merged.totalChapters).toBe(2427);
  });

  it('accepts a longer incoming chapter list over a shorter previous list', () => {
    const previous = details({
      id: 'abc12',
      chapters: [chapter('2'), chapter('1')],
      totalChapters: 10,
    });
    const incoming = details({
      id: 'abc12',
      chapters: Array.from({ length: 5 }, (_, index) =>
        chapter(String(5 - index))
      ),
      totalChapters: 10,
    });

    expect(mergeMangaDetailsRefresh(previous, incoming, 'abc12').chapters).toHaveLength(
      5
    );
  });

  it('preserves the highest reported total chapter count', () => {
    const previous = details({
      id: 'abc12',
      chapters: [chapter('3')],
      totalChapters: 100,
    });
    const incoming = details({
      id: 'abc12',
      chapters: [chapter('3'), chapter('2'), chapter('1')],
      totalChapters: 120,
    });

    expect(
      mergeMangaDetailsRefresh(previous, incoming, 'abc12').totalChapters
    ).toBe(120);
  });
});
