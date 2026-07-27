import {
  isExplicitMangaContentType,
  isVerticalOnlyContentType,
  normalizeContentTypeLabel,
  resolveEffectiveReaderLayout,
  resolveReaderContentProfile,
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

  describe('isExplicitMangaContentType', () => {
    it('recognizes manga labels', () => {
      expect(isExplicitMangaContentType('Manga')).toBe(true);
      expect(isExplicitMangaContentType('manga')).toBe(true);
      expect(isExplicitMangaContentType('Manhwa')).toBe(false);
      expect(isExplicitMangaContentType(null)).toBe(false);
    });
  });

  describe('resolveReaderContentProfile', () => {
    it('uses the manhwa profile for vertical-only provider types', () => {
      expect(
        resolveReaderContentProfile({
          titleType: 'Manhwa',
          detectedType: 'manga',
        })
      ).toBe('manhwa');
    });

    it('keeps the manga profile when the provider says Manga', () => {
      expect(
        resolveReaderContentProfile({
          titleType: 'Manga',
          detectedType: 'manhwa',
        })
      ).toBe('manga');
    });

    it('falls back to aspect detection when title type is unknown', () => {
      expect(
        resolveReaderContentProfile({
          titleType: null,
          detectedType: 'manhwa',
        })
      ).toBe('manhwa');

      expect(
        resolveReaderContentProfile({
          titleType: null,
          detectedType: 'manga',
        })
      ).toBe('manga');
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

    it('honors explicit LTR/RTL even when aspect detection says manhwa', () => {
      expect(
        resolveEffectiveReaderLayout({
          readingMode: 'rtl',
          titleType: 'Manga',
          detectedType: 'manhwa',
        })
      ).toBe('rtl');

      expect(
        resolveEffectiveReaderLayout({
          readingMode: 'ltr',
          titleType: null,
          detectedType: 'manhwa',
        })
      ).toBe('ltr');
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

    it('uses provider manga type for auto without waiting on detection', () => {
      expect(
        resolveEffectiveReaderLayout({
          readingMode: 'auto',
          titleType: 'Manga',
          detectedType: null,
        })
      ).toBe('ltr');
    });

    it('uses auto detection when mode is auto and type is unknown', () => {
      expect(
        resolveEffectiveReaderLayout({
          readingMode: 'auto',
          titleType: null,
          detectedType: 'manhwa',
        })
      ).toBe('vertical');

      expect(
        resolveEffectiveReaderLayout({
          readingMode: 'auto',
          titleType: null,
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
