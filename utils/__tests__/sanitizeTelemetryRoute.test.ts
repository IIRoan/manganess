import { sanitizeTelemetryRoute } from '../sanitizeTelemetryRoute';

describe('sanitizeTelemetryRoute', () => {
  it('strips manga and chapter ids', () => {
    expect(sanitizeTelemetryRoute('/manga/ro8ro/chapter/12')).toBe(
      '/manga/[id]/chapter/[n]'
    );
  });

  it('leaves tab routes alone', () => {
    expect(sanitizeTelemetryRoute('/settings')).toBe('/settings');
  });
});
