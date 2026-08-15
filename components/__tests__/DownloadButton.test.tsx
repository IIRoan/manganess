import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { DownloadStatus } from '@/types/download';

const mockDownloadChapter = jest.fn();
const mockGetChapterDownloadStatus = jest.fn();
const mockShowToast = jest.fn();

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    theme: 'dark',
    systemTheme: 'dark',
    actualTheme: 'dark',
  }),
}));

jest.mock('@/utils/haptics', () => ({
  useHapticFeedback: () => ({
    onPress: jest.fn(),
  }),
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({
    showToast: mockShowToast,
  }),
}));

jest.mock('@zedux/react', () => ({
  useAtomValue: () => ({
    activeDownloads: new Map(),
    pausedDownloads: new Map(),
  }),
}));

jest.mock('@/atoms/downloadManagerAtom', () => ({
  downloadManagerAtom: {},
}));

jest.mock('@/services/downloadManager', () => ({
  downloadManagerService: {
    downloadChapter: (...args: unknown[]) => mockDownloadChapter(...args),
    downloadChapterFromInterceptedRequest: jest.fn(),
    addProgressListener: jest.fn(() => jest.fn()),
    pauseDownload: jest.fn(),
    resumeDownload: jest.fn(),
    isDownloadPaused: jest.fn(() => false),
  },
}));

jest.mock('@/services/downloadStatusService', () => ({
  downloadStatusService: {
    getChapterDownloadStatus: (...args: unknown[]) =>
      mockGetChapterDownloadStatus(...args),
  },
}));

jest.mock('@/components/HiddenChapterWebView', () => {
  const { Text } = require('react-native');
  return {
    __esModule: true,
    default: () => <Text testID="hidden-chapter-webview">webview</Text>,
  };
});

jest.mock('@/utils/logger', () => ({
  logger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('@/constants/env', () => ({
  isDebugEnabled: jest.fn(() => false),
}));

import DownloadButton from '@/components/DownloadButton';

describe('DownloadButton', () => {
  beforeEach(() => {
    jest.useFakeTimers({ advanceTimers: true });
    jest.clearAllMocks();
    mockGetChapterDownloadStatus.mockResolvedValue({
      status: DownloadStatus.QUEUED,
      progress: 0,
      estimatedTimeRemaining: undefined,
    });
    mockDownloadChapter.mockResolvedValue({
      success: true,
      downloadId: 'zkz23_40',
      chapterImages: [{ pageNumber: 1 }],
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('starts downloads through downloadChapter without mounting a chapter WebView', async () => {
    const { getByRole, queryByTestId, unmount } = render(
      <DownloadButton
        mangaId="zkz23"
        chapterNumber="40"
        chapterUrl="/chapter/9333700"
        variant="icon"
      />
    );

    await waitFor(() => {
      expect(mockGetChapterDownloadStatus).toHaveBeenCalled();
    });

    fireEvent.press(getByRole('button'));

    await waitFor(() => {
      expect(mockDownloadChapter).toHaveBeenCalledWith(
        'zkz23',
        '40',
        '/chapter/9333700',
        undefined
      );
    });

    expect(queryByTestId('hidden-chapter-webview')).toBeNull();
    unmount();
  });
});
