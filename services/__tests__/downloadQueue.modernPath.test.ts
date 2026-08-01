jest.mock('@/constants/env', () => ({
  isDebugEnabled: jest.fn(() => false),
}));

const mockDownloadChapter = jest.fn();

jest.mock('../downloadManager', () => ({
  downloadManagerService: {
    downloadChapter: (...args: unknown[]) => mockDownloadChapter(...args),
    downloadChapterFromInterceptedRequest: jest.fn(),
  },
}));

import { downloadQueueService } from '../downloadQueue';

describe('downloadQueueService modern path', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDownloadChapter.mockResolvedValue({
      success: true,
      downloadId: 'zkz23_40',
    });
  });

  it('executes queued downloads through downloadChapter without WebView tokens', async () => {
    await (downloadQueueService as any).executeDownload({
      id: 'zkz23_40',
      mangaId: 'zkz23',
      mangaTitle: 'Test',
      chapterNumber: '40',
      chapterUrl: '/chapter/9333700',
      status: 'queued',
      priority: 1,
      addedAt: Date.now(),
      attempts: 0,
      maxAttempts: 3,
    });

    expect(mockDownloadChapter).toHaveBeenCalledWith(
      'zkz23',
      '40',
      '/chapter/9333700',
      'Test'
    );
  });
});
