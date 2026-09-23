import axios from 'axios';
import { MANGA_API_URL } from '@/constants/Config';

/** Native origin probe — faster than waiting for the VRF WebView. */
export async function probeMangaFireOriginStatus(
  timeoutMs = 3500
): Promise<number | null> {
  try {
    const response = await axios.get(`${MANGA_API_URL}/`, {
      timeout: timeoutMs,
      validateStatus: () => true,
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
      },
      maxRedirects: 0,
    });
    return response.status;
  } catch {
    return null;
  }
}
