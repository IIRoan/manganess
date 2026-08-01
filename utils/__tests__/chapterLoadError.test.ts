import { getChapterLoadErrorInfo } from '../chapterLoadError';

describe('getChapterLoadErrorInfo', () => {
  it('explains rate limits with retry', () => {
    const info = getChapterLoadErrorInfo({ response: { status: 429 } }, {
      chapterNumber: '261',
    });

    expect(info.title).toMatch(/busy/i);
    expect(info.message).toMatch(/try again/i);
    expect(info.canRetry).toBe(true);
  });

  it('explains forbidden / blocked requests', () => {
    const info = getChapterLoadErrorInfo({ response: { status: 403 } }, {
      chapterNumber: '12',
    });

    expect(info.title).toMatch(/blocked/i);
    expect(info.canRetry).toBe(true);
  });

  it('explains missing chapters from 404 responses', () => {
    const info = getChapterLoadErrorInfo(
      {
        response: {
          status: 404,
          data: { message: 'No query results for model [App\\Models\\Chapter].' },
        },
        message: 'Request failed with status code 404',
      },
      { chapterNumber: '261' }
    );

    expect(info.title).toContain('261');
    expect(info.message).toMatch(/no longer has|replaced|removed/i);
    expect(info.canRetry).toBe(true);
  });

  it('explains offline missing downloads without retry', () => {
    const info = getChapterLoadErrorInfo(null, {
      chapterNumber: '5',
      isOffline: true,
    });

    expect(info.title).toMatch(/isn’t downloaded|isn't downloaded/i);
    expect(info.canRetry).toBe(false);
  });

  it('maps “chapter not found” service errors', () => {
    const info = getChapterLoadErrorInfo(new Error('Chapter 99 not found'), {
      chapterNumber: '99',
    });

    expect(info.title).toContain('99');
    expect(info.canRetry).toBe(true);
  });

  it('falls back to a generic retryable message', () => {
    const info = getChapterLoadErrorInfo(new Error('boom'), {
      chapterNumber: '1',
    });

    expect(info.title.toLowerCase()).toContain('chapter');
    expect(info.message).toMatch(/retry|go back/i);
    expect(info.canRetry).toBe(true);
  });
});
