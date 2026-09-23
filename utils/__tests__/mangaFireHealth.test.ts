import axios from 'axios';
import { probeMangaFireOriginStatus } from '../mangaFireHealth';

jest.mock('axios');
jest.mock('@/constants/Config', () => ({
  MANGA_API_URL: 'https://mangafire.to',
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('probeMangaFireOriginStatus', () => {
  beforeEach(() => {
    mockedAxios.get.mockReset();
  });

  it('returns HTTP status from a quick origin probe', async () => {
    mockedAxios.get.mockResolvedValueOnce({ status: 522, data: '' });
    await expect(probeMangaFireOriginStatus(1000)).resolves.toBe(522);
  });

  it('returns null on timeout/network failure', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('timeout'));
    await expect(probeMangaFireOriginStatus(1000)).resolves.toBeNull();
  });
});
