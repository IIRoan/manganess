import { render, act, fireEvent } from '@testing-library/react-native';
import MangaFireVrfHost from '@/components/MangaFireVrfHost';
import { mangaFireVrfBridge } from '@/services/mangaFireVrfBridge';

const mockInjectJavaScript = jest.fn();
const mockReload = jest.fn();
let latestWebViewProps: any;

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');

  const WebView = React.forwardRef((props: any, ref: any) => {
    latestWebViewProps = props;

    React.useImperativeHandle(ref, () => ({
      injectJavaScript: mockInjectJavaScript,
      reload: mockReload,
    }));

    React.useEffect(() => {
      props.onLoadEnd?.();
    }, [props.onLoadEnd]);

    return <View testID="manga-fire-vrf-webview" />;
  });
  WebView.displayName = 'WebView';

  return { __esModule: true, default: WebView };
});

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

jest.mock('@/utils/logger', () => ({
  logger: () => mockLogger,
}));

jest.mock('@/constants/env', () => ({
  isDebugEnabled: jest.fn(() => false),
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    actualTheme: 'light',
    accentColor: '#2E8B57',
  }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

describe('MangaFireVrfHost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestWebViewProps = undefined;
    mangaFireVrfBridge.detachHost();
  });

  it('attaches the hidden webview host and injects readiness script', () => {
    const attachSpy = jest.spyOn(mangaFireVrfBridge, 'attachHost');

    const { getByTestId } = render(<MangaFireVrfHost />);

    expect(
      getByTestId('manga-fire-vrf-webview', { includeHiddenElements: true })
    ).toBeTruthy();
    expect(attachSpy).toHaveBeenCalledWith(expect.any(Function), {
      reload: expect.any(Function),
    });
    expect(latestWebViewProps.injectedJavaScript).toContain('notifyReady');
    expect(mockInjectJavaScript).toHaveBeenCalledWith(
      expect.stringContaining('notifyReady')
    );

    attachSpy.mockRestore();
  });

  it('forwards webview messages to the vrf bridge', () => {
    const handleMessageSpy = jest.spyOn(mangaFireVrfBridge, 'handleMessage');

    render(<MangaFireVrfHost />);

    act(() => {
      latestWebViewProps.onMessage?.({
        nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
      });
    });

    expect(handleMessageSpy).toHaveBeenCalledWith(
      JSON.stringify({ type: 'ready' })
    );
    handleMessageSpy.mockRestore();
  });

  it('injects javascript through the mounted webview ref', () => {
    const attachSpy = jest.spyOn(mangaFireVrfBridge, 'attachHost');

    render(<MangaFireVrfHost />);

    const inject = attachSpy.mock.calls[0]?.[0];
    mockInjectJavaScript.mockClear();
    inject?.('from-webview-ref');

    expect(mockInjectJavaScript).toHaveBeenCalledWith('from-webview-ref');
    attachSpy.mockRestore();
  });

  it('logs webview load failures', () => {
    render(<MangaFireVrfHost />);

    act(() => {
      latestWebViewProps.onError?.({
        nativeEvent: { description: 'network failed' },
      });
    });

    expect(mockLogger.error).toHaveBeenCalledWith(
      'Service',
      'MangaFire VRF host failed to load',
      expect.objectContaining({ error: 'network failed' })
    );
  });

  it('reloads when the iOS webview content process is terminated', () => {
    const reportSpy = jest.spyOn(mangaFireVrfBridge, 'reportHostEvent');
    render(<MangaFireVrfHost />);
    mockReload.mockClear();

    act(() => {
      latestWebViewProps.onContentProcessDidTerminate?.();
    });

    expect(reportSpy).toHaveBeenCalledWith({ type: 'terminated' });
    expect(mockReload).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Service',
      'MangaFire VRF host WebView process terminated'
    );
    reportSpy.mockRestore();
  });

  it('stops reload loops, then allows another reload after the cooldown window', () => {
    let now = 1_000_000;
    const dateNowSpy = jest.spyOn(Date, 'now').mockImplementation(() => now);

    try {
      render(<MangaFireVrfHost />);
      mockReload.mockClear();

      act(() => {
        latestWebViewProps.onContentProcessDidTerminate?.();
        latestWebViewProps.onContentProcessDidTerminate?.();
        latestWebViewProps.onContentProcessDidTerminate?.();
      });

      expect(mockReload).toHaveBeenCalledTimes(2);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Service',
        'MangaFire VRF host reload limit reached'
      );

      now += 60_001;
      act(() => {
        latestWebViewProps.onContentProcessDidTerminate?.();
      });

      expect(mockReload).toHaveBeenCalledTimes(3);
    } finally {
      dateNowSpy.mockRestore();
    }
  });

  it('resets the reload budget when the host becomes ready', () => {
    render(<MangaFireVrfHost />);
    mockReload.mockClear();

    act(() => {
      latestWebViewProps.onContentProcessDidTerminate?.();
      latestWebViewProps.onContentProcessDidTerminate?.();
    });
    expect(mockReload).toHaveBeenCalledTimes(2);

    act(() => {
      latestWebViewProps.onMessage?.({
        nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
      });
      latestWebViewProps.onContentProcessDidTerminate?.();
    });

    expect(mockReload).toHaveBeenCalledTimes(3);
  });

  it('keeps the webview on-screen so iOS will run its javascript', () => {
    render(<MangaFireVrfHost />);

    expect(latestWebViewProps.style).toEqual(
      expect.objectContaining({
        width: 64,
        height: 64,
      })
    );
  });

  it('expands to a visible security check when Cloudflare challenges the host', () => {
    const { getByText, getByLabelText, queryByText } = render(
      <MangaFireVrfHost />
    );

    act(() => {
      latestWebViewProps.onMessage?.({
        nativeEvent: { data: JSON.stringify({ type: 'challenge', title: 'Just a moment...' }) },
      });
    });

    expect(getByText('Security check')).toBeTruthy();
    expect(
      getByText('Complete the check so manga can load on this device.')
    ).toBeTruthy();
    expect(latestWebViewProps.scrollEnabled).toBe(true);

    fireEvent.press(getByLabelText('Dismiss security check'));

    expect(queryByText('Security check')).toBeNull();
    expect(latestWebViewProps.scrollEnabled).toBe(false);
  });

  it('shows the security check if Cloudflare challenges the host after it was ready', () => {
    const { getByText, queryByText } = render(<MangaFireVrfHost />);

    act(() => {
      latestWebViewProps.onMessage?.({
        nativeEvent: { data: JSON.stringify({ type: 'ready' }) },
      });
    });

    expect(queryByText('Security check')).toBeNull();

    act(() => {
      latestWebViewProps.onMessage?.({
        nativeEvent: {
          data: JSON.stringify({ type: 'challenge', title: 'Just a moment...' }),
        },
      });
    });

    expect(getByText('Security check')).toBeTruthy();
    expect(latestWebViewProps.scrollEnabled).toBe(true);
  });

  it('treats Cloudflare 403 responses as a challenge, not a fatal load error', () => {
    const { getByText } = render(<MangaFireVrfHost />);

    act(() => {
      latestWebViewProps.onHttpError?.({
        nativeEvent: {
          statusCode: 403,
          description: '',
          url: 'https://mangafire.to/',
        },
      });
    });

    expect(mockLogger.error).not.toHaveBeenCalledWith(
      'Service',
      'MangaFire VRF host HTTP error',
      expect.anything()
    );
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Network',
      'MangaFire VRF host received Cloudflare 403',
      expect.objectContaining({ url: 'https://mangafire.to/' })
    );
    expect(getByText('Security check')).toBeTruthy();
  });

  it('logs when debug mode is enabled', () => {
    const { isDebugEnabled } = require('@/constants/env');
    isDebugEnabled.mockReturnValue(true);

    render(<MangaFireVrfHost />);

    expect(mockLogger.info).toHaveBeenCalledWith(
      'Service',
      'MangaFire VRF host loaded'
    );
  });
});
