import {
  isVerticalOnlyContentType,
  normalizeContentTypeLabel,
  resolveEffectiveReaderLayout,
} from '@/utils/contentType';

describe('contentType', () => {
  describe('normalizeContentTypeLabel', () => {
    it('trims and lowercases labels', () => {
      expect(normalizeContentTypeLabel('  Manhwa ')).toBe('manhwa');
      expect(normalizeContentTypeLabel(undefined)).toBe('');
    });
  });

  describe('isVerticalOnlyContentType', () => {
    it('treats manhwa, manhua, and webtoon as vertical-only', () => {
      expect(isVerticalOnlyContentType('Manhwa')).toBe(true);
      expect(isVerticalOnlyContentType('manhua')).toBe(true);
      expect(isVerticalOnlyContentType('Webtoon')).toBe(true);
      expect(isVerticalOnlyContentType('webtoons')).toBe(true);
    });

    it('does not treat manga or comics as vertical-only', () => {
      expect(isVerticalOnlyContentType('Manga')).toBe(false);
      expect(isVerticalOnlyContentType('Comic')).toBe(false);
      expect(isVerticalOnlyContentType(null)).toBe(false);
      expect(isVerticalOnlyContentType(undefined)).toBe(false);
    });
  });

  describe('resolveEffectiveReaderLayout', () => {
    it('forces vertical for manhwa even when reading mode is LTR or RTL', () => {
      expect(
        resolveEffectiveReaderLayout({
          readingMode: 'ltr',
          titleType: 'Manhwa',
        })
      ).toBe('vertical');

      expect(
        resolveEffectiveReaderLayout({
          readingMode: 'rtl',
          titleType: 'manhwa',
        })
      ).toBe('vertical');
    });

    it('forces vertical when aspect detection finds manhwa panels', () => {
      expect(
        resolveEffectiveReaderLayout({
          readingMode: 'rtl',
          titleType: 'Manga',
          detectedType: 'manhwa',
        })
      ).toBe('vertical');
    });

    it('honors LTR/RTL for manga titles', () => {
      expect(
        resolveEffectiveReaderLayout({
          readingMode: 'ltr',
          titleType: 'Manga',
          detectedType: 'manga',
        })
      ).toBe('ltr');

      expect(
        resolveEffectiveReaderLayout({
          readingMode: 'rtl',
          titleType: 'Manga',
          detectedType: 'manga',
        })
      ).toBe('rtl');
    });

    it('uses auto detection for manga when mode is auto', () => {
      expect(
        resolveEffectiveReaderLayout({
          readingMode: 'auto',
          titleType: 'Manga',
          detectedType: 'manga',
        })
      ).toBe('ltr');

      expect(
        resolveEffectiveReaderLayout({
          readingMode: 'auto',
          titleType: null,
          detectedType: null,
        })
      ).toBeNull();
    });
  });
});
