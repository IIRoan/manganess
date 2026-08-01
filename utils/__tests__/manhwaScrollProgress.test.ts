import {
  averageMeasuredHeight,
  computeManhwaScrollProgress,
  DEFAULT_MANHWA_PAGE_HEIGHT,
  estimateManhwaContentHeight,
} from '../manhwaScrollProgress';

describe('averageMeasuredHeight', () => {
  it('returns fallback when no heights are known', () => {
    expect(averageMeasuredHeight(new Map())).toBe(DEFAULT_MANHWA_PAGE_HEIGHT);
    expect(averageMeasuredHeight(new Map(), 250)).toBe(250);
  });

  it('averages measured heights', () => {
    const heights = new Map([
      [0, 400],
      [1, 600],
    ]);
    expect(averageMeasuredHeight(heights)).toBe(500);
  });
});

describe('estimateManhwaContentHeight', () => {
  it('uses fallback for every page when none are measured', () => {
    expect(
      estimateManhwaContentHeight({
        pageCount: 3,
        heights: new Map(),
        footerHeight: 80,
      })
    ).toBe(3 * DEFAULT_MANHWA_PAGE_HEIGHT + 80);
  });

  it('uses measured heights and averages the rest', () => {
    const heights = new Map([
      [0, 1000],
      [1, 1000],
    ]);
    // Unknown pages (index 2) estimated at average 1000
    expect(
      estimateManhwaContentHeight({
        pageCount: 3,
        heights,
        footerHeight: 100,
      })
    ).toBe(1000 + 1000 + 1000 + 100);
  });
});

describe('computeManhwaScrollProgress', () => {
  it('returns 0 for empty chapters or zero viewport', () => {
    expect(
      computeManhwaScrollProgress({
        offsetY: 100,
        viewportHeight: 800,
        pageCount: 0,
        heights: new Map(),
        footerHeight: 80,
      })
    ).toBe(0);

    expect(
      computeManhwaScrollProgress({
        offsetY: 100,
        viewportHeight: 0,
        pageCount: 5,
        heights: new Map(),
        footerHeight: 80,
      })
    ).toBe(0);
  });

  it('returns 0 when content fits in the viewport', () => {
    expect(
      computeManhwaScrollProgress({
        offsetY: 0,
        viewportHeight: 800,
        pageCount: 1,
        heights: new Map([[0, 400]]),
        footerHeight: 80,
      })
    ).toBe(0);
  });

  it('computes progress from offset over estimated max scroll', () => {
    // 4 pages * 500 + footer 100 = 2100; viewport 800 → maxScroll 1300
    const heights = new Map([
      [0, 500],
      [1, 500],
    ]);
    expect(
      computeManhwaScrollProgress({
        offsetY: 650,
        viewportHeight: 800,
        pageCount: 4,
        heights,
        footerHeight: 100,
      })
    ).toBeCloseTo(0.5);
  });

  it('clamps to 0–1', () => {
    const heights = new Map([[0, 1000]]);
    expect(
      computeManhwaScrollProgress({
        offsetY: -50,
        viewportHeight: 500,
        pageCount: 2,
        heights,
        footerHeight: 0,
      })
    ).toBe(0);

    expect(
      computeManhwaScrollProgress({
        offsetY: 99999,
        viewportHeight: 500,
        pageCount: 2,
        heights,
        footerHeight: 0,
      })
    ).toBe(1);
  });

  it('stays stable when later pages are still placeholders but average is known', () => {
    // Early scroll must not jump to ~100% just because FlatList contentSize
    // only covers the mounted window of short placeholders.
    const heights = new Map([
      [0, 2000],
      [1, 2000],
      [2, 400], // placeholder still gated / loading
    ]);
    const pageCount = 20;
    const viewportHeight = 800;
    const footerHeight = 80;
    const midOffset = 3000;

    const progress = computeManhwaScrollProgress({
      offsetY: midOffset,
      viewportHeight,
      pageCount,
      heights,
      footerHeight,
    });

    // Average ≈ (2000+2000+400)/3 ≈ 1466.67; total ≈ 20*1466.67+80 ≈ 29413
    // maxScroll ≈ 28613; 3000/28613 ≈ 0.105
    expect(progress).toBeGreaterThan(0.05);
    expect(progress).toBeLessThan(0.2);
  });
});
