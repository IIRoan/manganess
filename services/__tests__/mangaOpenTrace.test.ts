import {
  getMangaOpenStartedAt,
  markMangaOpen,
  resetMangaOpenTraceForTests,
  startMangaOpen,
} from '../mangaOpenTrace';
import { reportMetric } from '../telemetryService';

jest.mock('../telemetryService', () => ({
  reportMetric: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  logger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('mangaOpenTrace', () => {
  const originalPerformance = globalThis.performance;
  let now = 1_000;

  beforeEach(() => {
    now = 1_000;
    resetMangaOpenTraceForTests();
    (reportMetric as jest.Mock).mockClear();
    globalThis.performance = { now: () => now } as Performance;
  });

  afterEach(() => {
    globalThis.performance = originalPerformance;
  });

  it('measures every phase from the original card press', () => {
    startMangaOpen('abc12', 'card');

    now = 1_180;
    markMangaOpen('mount', 'abc12');
    now = 1_200;
    markMangaOpen('visible', 'abc12');
    now = 1_240;
    markMangaOpen('hydrated', 'abc12');
    now = 1_310;
    markMangaOpen('header', 'abc12');
    now = 1_880;
    markMangaOpen('chapters', 'abc12');
    now = 1_900;
    const summary = markMangaOpen('complete', 'abc12');

    expect(reportMetric).toHaveBeenCalledWith({
      name: 'manga.open.mount',
      durationMs: 180,
      route: '/manga/[id]',
    });
    expect(reportMetric).toHaveBeenCalledWith({
      name: 'manga.open.header',
      durationMs: 310,
      route: '/manga/[id]',
    });
    expect(reportMetric).toHaveBeenCalledWith({
      name: 'manga.open.chapters',
      durationMs: 880,
      route: '/manga/[id]',
    });
    expect(reportMetric).toHaveBeenCalledWith({
      name: 'manga.open.complete',
      durationMs: 900,
      route: '/manga/[id]',
    });
    expect(summary).toEqual({
      source: 'card',
      pressToMountMs: 180,
      pressToVisibleMs: 200,
      pressToHydratedMs: 240,
      pressToHeaderMs: 310,
      pressToChaptersMs: 880,
      pressToCompleteMs: 900,
      mountToVisibleMs: 20,
      mountToHeaderMs: 130,
      headerToChaptersMs: 570,
    });
    expect(console.log).toHaveBeenCalledWith('[MangaOpen] card press');
    expect(console.log).toHaveBeenCalledWith(
      '[MangaOpen] header 310ms from press'
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('[MangaOpen] card content ready 900ms from press')
    );
    expect(console.log).toHaveBeenCalledWith(
      expect.stringMatching(/header:\s+310ms/)
    );
  });

  it('keeps the first press time when the same manga is started again immediately', () => {
    const first = startMangaOpen('abc12', 'card');
    now = 1_040;
    const second = startMangaOpen('abc12', 'home');
    expect(second).toBe(first);

    now = 1_200;
    markMangaOpen('mount', 'abc12');
    expect(reportMetric).toHaveBeenCalledWith({
      name: 'manga.open.mount',
      durationMs: 200,
      route: '/manga/[id]',
    });
  });

  it('ignores marks for a different manga than the active press', () => {
    startMangaOpen('abc12', 'card');
    now = 1_500;
    markMangaOpen('mount', 'other');
    expect(reportMetric).not.toHaveBeenCalled();
    expect(getMangaOpenStartedAt('other')).toBeNull();
    expect(getMangaOpenStartedAt('abc12')).toBe(1_000);
  });

  it('reports each phase only once', () => {
    startMangaOpen('abc12', 'card');
    now = 1_100;
    markMangaOpen('header', 'abc12');
    now = 1_400;
    markMangaOpen('header', 'abc12');
    expect(reportMetric).toHaveBeenCalledTimes(1);
  });
});
