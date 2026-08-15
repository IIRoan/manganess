import { render, act } from '@testing-library/react-native';
import MangaFireVrfHost from '@/components/MangaFireVrfHost';
import { mangaFireVrfBridge } from '@/services/mangaFireVrfBridge';

const mockInjectJavaScript = jest.fn();
let latestWebViewProps: any;

jest.mock('react-native-webview', () => {
  const React = require('react');
  const { View } = require('react-native');

  const WebView = React.forwardRef((props: any, ref: any) => {
    latestWebViewProps = props;

    React.useImperativeHandle(ref, () => ({
      injectJavaScript: mockInjectJavaScript,
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

describe('MangaFireVrfHost', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    latestWebViewProps = undefined;
    mangaFireVrfBridge.detachHost();
  });

  it('attaches the hidden webview host and injects readiness script', () => {
    const attachSpy = jest.spyOn(mangaFireVrfBridge, 'attachHost');

    const { getByTestId } = render(<MangaFireVrfHost />);

    expect(getByTestId('manga-fire-vrf-webview')).toBeTruthy();
    expect(attachSpy).toHaveBeenCalled();
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
