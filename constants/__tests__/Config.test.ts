describe('Config', () => {
  const originalUrl = process.env.EXPO_PUBLIC_MANGA_API_URL;

  afterEach(() => {
    if (originalUrl === undefined) {
      delete process.env.EXPO_PUBLIC_MANGA_API_URL;
    } else {
      process.env.EXPO_PUBLIC_MANGA_API_URL = originalUrl;
    }
    jest.resetModules();
  });

  it('falls back to MangaFire when the public env is unset', () => {
    delete process.env.EXPO_PUBLIC_MANGA_API_URL;
    jest.resetModules();
    const { MANGA_API_URL } = require('../Config');
    expect(MANGA_API_URL).toBe('https://mangafire.to');
  });

  it('uses EXPO_PUBLIC_MANGA_API_URL when set', () => {
    process.env.EXPO_PUBLIC_MANGA_API_URL = 'https://example.test';
    jest.resetModules();
    const { MANGA_API_URL } = require('../Config');
    expect(MANGA_API_URL).toBe('https://example.test');
  });
});
