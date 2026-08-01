import { getImageRetryDelayMs, IMAGE_MAX_AUTO_RETRIES } from '../imageRetry';

describe('imageRetry', () => {
  it('uses escalating delays per attempt', () => {
    expect(getImageRetryDelayMs(1)).toBe(2000);
    expect(getImageRetryDelayMs(2)).toBe(5000);
    expect(getImageRetryDelayMs(3)).toBe(10000);
  });

  it('caps at the last delay for attempts beyond the schedule', () => {
    expect(getImageRetryDelayMs(4)).toBe(10000);
    expect(getImageRetryDelayMs(10)).toBe(10000);
  });

  it('clamps invalid attempts to the first delay', () => {
    expect(getImageRetryDelayMs(0)).toBe(2000);
    expect(getImageRetryDelayMs(-3)).toBe(2000);
  });

  it('exposes the auto retry limit matching the schedule length', () => {
    expect(IMAGE_MAX_AUTO_RETRIES).toBe(3);
  });
});
