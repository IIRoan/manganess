import {
  buildMangaImageSource,
  getMangaImageSize,
  MANGA_IMAGE_REQUEST_HEADERS,
  needsMangaImageHeaders,
} from '@/utils/mangaImageHeaders';

describe('mangaImageHeaders', () => {
  describe('needsMangaImageHeaders', () => {
    it('requires headers for MangaFire chapter CDNs', () => {
      expect(
        needsMangaImageHeaders('https://l1n.mfcdn1.xyz/mf/abc/h/p.jpg')
      ).toBe(true);
      expect(
        needsMangaImageHeaders(
          'https://static.mfcdn.nl/932d/i/b/b2/cover@280.jpg'
        )
      ).toBe(true);
    });

    it('skips headers for local assets', () => {
      expect(needsMangaImageHeaders('file:///data/page.jpg')).toBe(false);
      expect(needsMangaImageHeaders('content://media/1')).toBe(false);
      expect(needsMangaImageHeaders(null)).toBe(false);
    });
  });

  describe('buildMangaImageSource', () => {
    it('attaches mangafire Referer for protected CDN urls', () => {
      expect(
        buildMangaImageSource('https://l1n.mfcdn1.xyz/mf/abc/h/p.jpg')
      ).toEqual({
        uri: 'https://l1n.mfcdn1.xyz/mf/abc/h/p.jpg',
        headers: MANGA_IMAGE_REQUEST_HEADERS,
      });
      expect(MANGA_IMAGE_REQUEST_HEADERS.Referer).toBe('https://mangafire.to/');
    });

    it('returns plain uri for local files', () => {
      expect(buildMangaImageSource('file:///cache/page.jpg')).toEqual({
        uri: 'file:///cache/page.jpg',
      });
    });

    it('returns null for empty uris', () => {
      expect(buildMangaImageSource(null)).toBeNull();
      expect(buildMangaImageSource('')).toBeNull();
    });
  });

  describe('getMangaImageSize', () => {
    it('uses getSizeWithHeaders for CDN urls', () => {
      const RN = require('react-native');
      const getSizeSpy = jest
        .spyOn(RN.Image, 'getSize')
        .mockImplementation(() => undefined);
      const headersSpy = jest
        .spyOn(RN.Image, 'getSizeWithHeaders')
        .mockImplementation(() => undefined);
      const success = jest.fn();
      const failure = jest.fn();

      getMangaImageSize(
        'https://l1n.mfcdn1.xyz/mf/abc/h/p.jpg',
        success,
        failure
      );

      expect(headersSpy).toHaveBeenCalledWith(
        'https://l1n.mfcdn1.xyz/mf/abc/h/p.jpg',
        MANGA_IMAGE_REQUEST_HEADERS,
        success,
        failure
      );
      expect(getSizeSpy).not.toHaveBeenCalled();

      getSizeSpy.mockRestore();
      headersSpy.mockRestore();
    });

    it('uses plain getSize for local files', () => {
      const RN = require('react-native');
      const getSizeSpy = jest
        .spyOn(RN.Image, 'getSize')
        .mockImplementation(() => undefined);
      const headersSpy = jest
        .spyOn(RN.Image, 'getSizeWithHeaders')
        .mockImplementation(() => undefined);
      const success = jest.fn();

      getMangaImageSize('file:///cache/page.jpg', success);

      expect(getSizeSpy).toHaveBeenCalledWith(
        'file:///cache/page.jpg',
        success,
        undefined
      );
      expect(headersSpy).not.toHaveBeenCalled();

      getSizeSpy.mockRestore();
      headersSpy.mockRestore();
    });
  });
});
