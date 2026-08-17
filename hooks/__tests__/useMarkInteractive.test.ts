import { renderHook } from '@testing-library/react-native';
import { reportMetric } from '@/services/telemetryService';
import { useMarkInteractive } from '../useMarkInteractive';

let mockPathname = '/manga/abc';
let now = 10_000;

jest.mock('expo-router', () => ({
  usePathname: () => mockPathname,
}));

jest.mock('@/constants/env', () => ({
  appStartTs: 0,
}));

jest.mock('@/services/telemetryService', () => ({
  reportMetric: jest.fn(),
}));

describe('useMarkInteractive', () => {
  const originalPerformance = globalThis.performance;

  beforeEach(() => {
    mockPathname = '/manga/abc';
    now = 10_000;
    (reportMetric as jest.Mock).mockClear();
    globalThis.performance = { now: () => now } as Performance;
  });

  afterEach(() => {
    globalThis.performance = originalPerformance;
  });

  it('measures screen TTI from mount, not app boot', () => {
    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useMarkInteractive(ready),
      { initialProps: { ready: false } }
    );

    now = 10_450;
    rerender({ ready: true });

    expect(reportMetric).toHaveBeenCalledWith({
      name: 'tti',
      durationMs: 450,
      route: '/manga/[id]',
    });
  });

  it('measures splash hide from app start as app.tti', () => {
    renderHook(() =>
      useMarkInteractive(true, { from: 'appStart', metric: 'app.tti' })
    );

    expect(reportMetric).toHaveBeenCalledWith({
      name: 'app.tti',
      durationMs: 10_000,
      route: '/manga/[id]',
    });
  });

  it('restarts the mount clock when the pathname changes', () => {
    const { rerender } = renderHook(() => useMarkInteractive(true));
    expect(reportMetric).toHaveBeenCalledTimes(1);

    now = 10_080;
    mockPathname = '/bookmarks';
    rerender({});

    expect(reportMetric).toHaveBeenCalledWith({
      name: 'tti',
      durationMs: 0,
      route: '/bookmarks',
    });
  });

  it('reports tti again after ready drops during a reload', () => {
    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useMarkInteractive(ready),
      { initialProps: { ready: false } }
    );

    now = 10_450;
    rerender({ ready: true });
    expect(reportMetric).toHaveBeenCalledTimes(1);

    rerender({ ready: false });
    expect(reportMetric).toHaveBeenCalledTimes(1);

    now = 10_700;
    rerender({ ready: true });

    expect(reportMetric).toHaveBeenCalledTimes(2);
    expect(reportMetric).toHaveBeenLastCalledWith({
      name: 'tti',
      durationMs: 700,
      route: '/manga/[id]',
    });
  });

  it('reports tti again when ready drops after a route change', () => {
    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) => useMarkInteractive(ready),
      { initialProps: { ready: true } }
    );
    expect(reportMetric).toHaveBeenCalledTimes(1);

    now = 10_080;
    mockPathname = '/manga/abc/chapter/2';
    rerender({ ready: true });
    expect(reportMetric).toHaveBeenCalledTimes(2);

    rerender({ ready: false });
    now = 10_400;
    rerender({ ready: true });

    expect(reportMetric).toHaveBeenCalledTimes(3);
    expect(reportMetric).toHaveBeenLastCalledWith({
      name: 'tti',
      durationMs: 320,
      route: '/manga/[id]/chapter/[n]',
    });
  });

  it('measures TTI from an explicit press timestamp when provided', () => {
    const { rerender } = renderHook(
      ({ ready }: { ready: boolean }) =>
        useMarkInteractive(ready, { startedAt: 9_500 }),
      { initialProps: { ready: false } }
    );

    now = 10_400;
    rerender({ ready: true });

    expect(reportMetric).toHaveBeenCalledWith({
      name: 'tti',
      durationMs: 900,
      route: '/manga/[id]',
    });
  });
});
