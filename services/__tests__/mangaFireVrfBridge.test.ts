import {
  appendVrfParams,
  mangaFireVrfBridge,
} from '@/services/mangaFireVrfBridge';

describe('mangaFireVrfBridge', () => {
  afterEach(() => {
    mangaFireVrfBridge.detachHost();
  });

  it('skips vrf for top-titles endpoints', async () => {
    await expect(
      appendVrfParams('/top-titles', { type: 'trending', limit: 5 })
    ).resolves.toEqual({ type: 'trending', limit: 5 });
  });

  it('returns a test vrf token for protected endpoints in Jest', async () => {
    await expect(
      appendVrfParams('/titles/ro8ro')
    ).resolves.toEqual({ vrf: 'test-vrf-token' });
  });
});
