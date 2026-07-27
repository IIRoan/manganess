import {
  horizontalPageIndexFromOffset,
  horizontalScrollIndexForPage,
} from '@/utils/readerPageIndex';

describe('readerPageIndex', () => {
  const pageWidth = 400;
  const pageCount = 5;

  describe('horizontalPageIndexFromOffset', () => {
    it('maps LTR offsets to the visible page index', () => {
      expect(
        horizontalPageIndexFromOffset({
          offsetX: 0,
          pageWidth,
          pageCount,
          inverted: false,
        })
      ).toBe(0);

      expect(
        horizontalPageIndexFromOffset({
          offsetX: 800,
          pageWidth,
          pageCount,
          inverted: false,
        })
      ).toBe(2);
    });

    it('maps inverted RTL offsets to the logical page index', () => {
      expect(
        horizontalPageIndexFromOffset({
          offsetX: 0,
          pageWidth,
          pageCount,
          inverted: true,
        })
      ).toBe(4);

      expect(
        horizontalPageIndexFromOffset({
          offsetX: 800,
          pageWidth,
          pageCount,
          inverted: true,
        })
      ).toBe(2);
    });
  });

  describe('horizontalScrollIndexForPage', () => {
    it('returns the same index for LTR lists', () => {
      expect(
        horizontalScrollIndexForPage({
          pageIndex: 2,
          pageCount,
          inverted: false,
        })
      ).toBe(2);
    });

    it('mirrors the index for inverted RTL lists', () => {
      expect(
        horizontalScrollIndexForPage({
          pageIndex: 0,
          pageCount,
          inverted: true,
        })
      ).toBe(4);

      expect(
        horizontalScrollIndexForPage({
          pageIndex: 4,
          pageCount,
          inverted: true,
        })
      ).toBe(0);
    });
  });
});
