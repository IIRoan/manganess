import axios from 'axios';
import {
  resolveSourceManga,
  searchSources,
  setSourceEnabled,
} from '@/services/sources';
import { azukiSource, parseAzukiReaderHtml } from '@/services/sources/azuki';
import { isLikelyLegacyMangaId } from '@/services/mangaIdMigrationService';

jest.mock('axios');
jest.mock('@/utils/logger', () => ({
  logger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

const readerHtml = (pageProps: unknown) =>
  `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: { pageProps },
  })}</script></html>`;

const pageProps = {
  chapters: [
    {
      chapterNumber: 1,
      title: 'SISTERS',
      status: 'PUBLISHED',
      publishedAt: '2026-09-17T15:31:43.012Z',
      mobileThumbnailImageUrl: 'https://cdn.test/ch1-cover.jpg',
    },
    { chapterNumber: 2, title: 'PACT', status: 'PUBLISHED' },
    { chapterNumber: 3, title: 'DRAFT', status: 'DRAFT' },
  ],
  initialChapters: [
    {
      chapterNumber: 2,
      panels: [
        { pageNumber: 2, imageUrl: 'p2.png', mobileImageUrl: 'p2.jpg' },
        { pageNumber: 1, imageUrl: 'p1.png' },
      ],
    },
  ],
};

beforeEach(() => {
  mockedAxios.get.mockResolvedValue({ data: readerHtml(pageProps) });
});

describe('manga sources', () => {
  it('routes namespaced ids to their source and leaves MangaFire ids alone', () => {
    expect(resolveSourceManga('azuki~azuki')).toEqual({
      source: azukiSource,
      key: 'azuki',
    });
    expect(resolveSourceManga('92kk8')).toBeNull();
    expect(resolveSourceManga('unknown~x')).toBeNull();
  });

  it('never treats source ids as legacy MangaFire ids to migrate', () => {
    expect(isLikelyLegacyMangaId('azuki~azuki')).toBe(false);
    expect(isLikelyLegacyMangaId('one-piece')).toBe(true);
  });

  it('parses the embedded Next.js reader data', () => {
    expect(parseAzukiReaderHtml(readerHtml(pageProps)).chapters).toHaveLength(3);
    expect(() => parseAzukiReaderHtml('<html></html>')).toThrow();
  });

  it('lists published chapters newest first', async () => {
    const details = await azukiSource.fetchDetails('azuki');
    expect(details.id).toBe('azuki~azuki');
    expect(details.bannerImage).toBe('https://cdn.test/ch1-cover.jpg');
    expect(details.chapters.map((c) => [c.number, c.title])).toEqual([
      ['2', 'Chapter 2: PACT'],
      ['1', 'Chapter 1: SISTERS'],
    ]);
  });

  it('returns chapter pages in order, preferring mobile renditions', async () => {
    await expect(azukiSource.fetchChapterPages('azuki', '2')).resolves.toEqual([
      'p1.png',
      'p2.jpg',
    ]);
    await expect(azukiSource.fetchChapterPages('azuki', '9')).rejects.toThrow();
  });

  it('skips sources turned off in Settings', async () => {
    await setSourceEnabled('azuki', false);
    await expect(searchSources('azuki')).resolves.toEqual([]);
    await setSourceEnabled('azuki', true);
    expect((await searchSources('azuki')).map((m) => m.id)).toEqual([
      'azuki~azuki',
    ]);
  });

  it('is searchable by title', async () => {
    expect((await azukiSource.search('azu')).map((m) => m.id)).toEqual([
      'azuki~azuki',
    ]);
    await expect(azukiSource.search('naruto')).resolves.toEqual([]);
  });
});
