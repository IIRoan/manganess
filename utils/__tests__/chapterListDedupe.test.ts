import {
  dedupeChaptersPreferringOfficial,
  filterOutExtraChapters,
  isExtraChapterNumber,
  mergeChaptersPreferringOfficial,
  resolveReportedChapterTotal,
} from '@/utils/chapterListDedupe';

describe('chapterListDedupe', () => {
  describe('isExtraChapterNumber / filterOutExtraChapters', () => {
    it('treats half chapters as extras', () => {
      expect(isExtraChapterNumber('3.5')).toBe(true);
      expect(isExtraChapterNumber('3.1')).toBe(true);
      expect(isExtraChapterNumber('1.10')).toBe(true);
      expect(isExtraChapterNumber('3')).toBe(false);
      expect(isExtraChapterNumber('3.0')).toBe(false);
    });

    it('filters extras when hideExtras is enabled', () => {
      const chapters = [
        { number: '5' },
        { number: '4.5' },
        { number: '4' },
        { number: '3.5' },
        { number: '3.1' },
        { number: '3' },
      ];

      expect(
        filterOutExtraChapters(chapters, true).map((c) => c.number)
      ).toEqual(['5', '4', '3']);
      expect(filterOutExtraChapters(chapters, false)).toEqual(chapters);
    });
  });

  describe('dedupeChaptersPreferringOfficial', () => {
    it('prefers official when the same number appears twice', () => {
      const result = dedupeChaptersPreferringOfficial([
        { id: 1, number: 1190, type: 'official' },
        { id: 2, number: 1190, type: 'unofficial' },
        { id: 3, number: 1189, type: 'unofficial' },
        { id: 4, number: 1189, type: 'official' },
      ]);

      expect(result).toEqual([
        { id: 1, number: 1190, type: 'official' },
        { id: 4, number: 1189, type: 'official' },
      ]);
    });

    it('keeps unofficial-only extras such as 25.5', () => {
      const result = dedupeChaptersPreferringOfficial([
        { id: 1, number: 26, type: 'official' },
        { id: 2, number: '25.5', type: 'unofficial' },
        { id: 3, number: 25, type: 'official' },
      ]);

      expect(result.map((c) => String(c.number))).toEqual(['26', '25.5', '25']);
    });

    it('preserves newest-first order of first appearance', () => {
      const result = dedupeChaptersPreferringOfficial([
        { id: 1, number: 3, type: 'unofficial' },
        { id: 2, number: 2, type: 'official' },
        { id: 3, number: 1, type: 'official' },
      ]);

      expect(result.map((c) => c.number)).toEqual([3, 2, 1]);
    });
  });

  describe('mergeChaptersPreferringOfficial', () => {
    it('replaces an earlier unofficial row when official arrives later', () => {
      const merged = mergeChaptersPreferringOfficial(
        [{ number: '10', type: 'unofficial', url: '/u' }],
        [{ number: '10', type: 'official', url: '/o' }]
      );

      expect(merged).toEqual([
        { number: '10', type: 'official', url: '/o' },
      ]);
    });

    it('appends new numbers without dropping prior ones', () => {
      const merged = mergeChaptersPreferringOfficial(
        [{ number: '12', type: 'official' }],
        [{ number: '11', type: 'unofficial' }]
      );

      expect(merged.map((c) => c.number)).toEqual(['12', '11']);
    });
  });

  describe('resolveReportedChapterTotal', () => {
    it('provisionally trusts totals when no duplicates are seen', () => {
      expect(
        resolveReportedChapterTotal({
          rawCount: 60,
          uniqueCount: 60,
          apiTotal: 1190,
          hasMore: true,
        })
      ).toBe(1190);

      expect(
        resolveReportedChapterTotal({
          rawCount: 60,
          uniqueCount: 30,
          apiTotal: 2432,
          hasMore: true,
        })
      ).toBeUndefined();

      expect(
        resolveReportedChapterTotal({
          rawCount: 2432,
          uniqueCount: 1241,
          apiTotal: 2432,
          hasMore: false,
        })
      ).toBe(1241);
    });
  });
});
