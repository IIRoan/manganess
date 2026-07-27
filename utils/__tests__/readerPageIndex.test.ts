import {
  horizontalPageIndexFromOffset,
  horizontalScrollIndexForPage,
} from '@/utils/readerPageIndex';

describe('readerPageIndex', () => {
  const pageWidth = 400;
  const pageCount = 5;

  describe('horizontalPageIndexFromOffset', () => {
    it('maps offsets to the data page index', () => {
      expect(
        horizontalPageIndexFromOffset({
          offsetX: 0,
          pageWidth,
          pageCount,
        })
      ).toBe(0);

      expect(
        horizontalPageIndexFromOffset({
          offsetX: 800,
          pageWidth,
          pageCount,
        })
      ).toBe(2);
    });

    it('clamps out-of-range offsets', () => {
      expect(
        horizontalPageIndexFromOffset({
          offsetX: -400,
          pageWidth,
          pageCount,
        })
      ).toBe(0);

      expect(
        horizontalPageIndexFromOffset({
          offsetX: 4000,
          pageWidth,
          pageCount,
        })
      ).toBe(4);
    });
  });

  describe('horizontalScrollIndexForPage', () => {
    it('returns the data index for programmatic scroll', () => {
      expect(
        horizontalScrollIndexForPage({
          pageIndex: 0,
          pageCount,
        })
      ).toBe(0);

      expect(
        horizontalScrollIndexForPage({
          pageIndex: 2,
          pageCount,
        })
      ).toBe(2);

      expect(
        horizontalScrollIndexForPage({
          pageIndex: 4,
          pageCount,
        })
      ).toBe(4);
    });

    it('clamps out-of-range page indices', () => {
      expect(
        horizontalScrollIndexForPage({
          pageIndex: -1,
          pageCount,
        })
      ).toBe(0);

      expect(
        horizontalScrollIndexForPage({
          pageIndex: 99,
          pageCount,
        })
      ).toBe(4);
    });
  });
});
