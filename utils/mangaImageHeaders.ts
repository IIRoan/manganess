import { Image as RNImage } from 'react-native';
import { MANGA_API_URL } from '@/constants/Config';

/** Headers MangaFire CDN hosts require for chapter page images. */
export const MANGA_IMAGE_REQUEST_HEADERS: Record<string, string> = {
  Referer: `${MANGA_API_URL}/`,
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
  Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
};

/**
 * Remote MangaFire / mfcdn URLs need a mangafire.to Referer.
 * Local file/content URIs must not send custom headers.
 */
export function needsMangaImageHeaders(
  uri: string | null | undefined
): boolean {
  if (!uri) return false;
  if (
    uri.startsWith('file://') ||
    uri.startsWith('content://') ||
    uri.startsWith('data:') ||
    uri.startsWith('asset://') ||
    uri.startsWith('ph://')
  ) {
    return false;
  }
  if (!/^https?:\/\//i.test(uri)) {
    return false;
  }

  try {
    const host = new URL(uri).hostname.toLowerCase();
    return (
      host === 'mangafire.to' ||
      host.endsWith('.mangafire.to') ||
      host.includes('mfcdn')
    );
  } catch {
    return /mfcdn|mangafire/i.test(uri);
  }
}

export type MangaImageSource = {
  uri: string;
  headers?: Record<string, string>;
};

/** Build an expo-image / RN Image source with CDN headers when needed. */
export function buildMangaImageSource(
  uri: string | null | undefined
): MangaImageSource | null {
  if (!uri) return null;
  if (!needsMangaImageHeaders(uri)) {
    return { uri };
  }
  return {
    uri,
    headers: { ...MANGA_IMAGE_REQUEST_HEADERS },
  };
}

/**
 * Measure remote/local images. Uses getSizeWithHeaders for protected CDNs
 * because plain getSize omits Referer and receives 403.
 */
export function getMangaImageSize(
  uri: string,
  success: (width: number, height: number) => void,
  failure?: (error: unknown) => void
): void {
  if (!uri) {
    failure?.(new Error('Missing image URI'));
    return;
  }

  if (!needsMangaImageHeaders(uri)) {
    RNImage.getSize(uri, success, failure as ((error: any) => void) | undefined);
    return;
  }

  RNImage.getSizeWithHeaders(
    uri,
    MANGA_IMAGE_REQUEST_HEADERS,
    success,
    failure as ((error: any) => void) | undefined
  );
}
