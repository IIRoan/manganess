import axios from 'axios';
import {
  File as FSFile,
  Directory as FSDirectory,
  Paths,
} from 'expo-file-system';
import { MANGA_IMAGE_REQUEST_HEADERS } from '@/utils/mangaImageHeaders';
import { logger } from '@/utils/logger';

/**
 * Manual reader page downloads.
 *
 * expo-image / RN Image use the native image stack with opaque, short
 * timeouts — when the MangaFire CDN is slow those loads time out even though
 * the URL is fine. Fetching the bytes ourselves (axios + 30s timeout) and
 * rendering from a local file sidesteps that entirely.
 */

const READER_CACHE_DIR = new FSDirectory(Paths.cache, 'reader_pages');
const DOWNLOAD_TIMEOUT_MS = 30000;

const inflightDownloads = new Map<string, Promise<string>>();

function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = (hash << 5) - hash + url.charCodeAt(i);
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

function ensureCacheDir(): void {
  if (!READER_CACHE_DIR.exists) {
    READER_CACHE_DIR.create({ intermediates: true, idempotent: true });
  }
}

function getCachedFile(url: string): FSFile {
  return new FSFile(READER_CACHE_DIR, `${hashUrl(url)}.jpg`);
}

/** Return a previously downloaded reader page, if still on disk. */
export function getCachedReaderImageUri(url: string): string | null {
  try {
    if (!READER_CACHE_DIR.exists) return null;
    const file = getCachedFile(url);
    const info = file.info();
    if (info.exists && typeof info.size === 'number' && info.size > 0) {
      return file.uri;
    }
  } catch {
    // Cache lookup is best-effort.
  }
  return null;
}

async function fetchAndStore(url: string): Promise<string> {
  ensureCacheDir();
  const file = getCachedFile(url);

  const existing = file.info();
  if (existing.exists && typeof existing.size === 'number' && existing.size > 0) {
    return file.uri;
  }

  const response = await axios.get<ArrayBuffer>(url, {
    headers: { ...MANGA_IMAGE_REQUEST_HEADERS },
    responseType: 'arraybuffer',
    timeout: DOWNLOAD_TIMEOUT_MS,
  });

  const bytes = new Uint8Array(response.data);
  if (bytes.length === 0) {
    throw new Error('Empty image response');
  }

  if (file.exists) {
    try {
      file.delete();
    } catch {
      // Destination might be locked; overwrite below if possible.
    }
  }
  file.write(bytes);

  return file.uri;
}

/**
 * Download a reader page to the cache directory and return its file URI.
 * Concurrent calls for the same URL share one request.
 */
export function downloadReaderImage(url: string): Promise<string> {
  const inflight = inflightDownloads.get(url);
  if (inflight) {
    return inflight;
  }

  const promise = (async () => {
    try {
      return await fetchAndStore(url);
    } catch (error) {
      logger().warn('Network', 'Manual reader image download failed', {
        url,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  })();

  // Clean up the inflight entry without creating an unhandled rejection.
  const tracked = promise.then(
    (uri) => {
      inflightDownloads.delete(url);
      return uri;
    },
    (error: unknown) => {
      inflightDownloads.delete(url);
      throw error;
    }
  );

  inflightDownloads.set(url, tracked);
  return tracked;
}
