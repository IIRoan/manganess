import {
  getErrorMessage,
  isForbiddenError,
  isNotFoundError,
  isRateLimitError,
} from '@/utils/httpErrors';

export interface ChapterLoadErrorInfo {
  title: string;
  message: string;
  canRetry: boolean;
}

function chapterLabel(chapterNumber?: string): string {
  const normalized = String(chapterNumber ?? '').trim();
  return normalized ? `Chapter ${normalized}` : 'This chapter';
}

/**
 * Maps load failures to user-facing copy for the chapter reader.
 */
export function getChapterLoadErrorInfo(
  error: unknown,
  context?: { chapterNumber?: string; isOffline?: boolean }
): ChapterLoadErrorInfo {
  const label = chapterLabel(context?.chapterNumber);

  if (context?.isOffline) {
    return {
      title: `${label} isn’t downloaded`,
      message:
        'Connect to the internet to read online, or download this chapter first.',
      canRetry: false,
    };
  }

  if (isRateLimitError(error)) {
    return {
      title: 'MangaFire is busy',
      message: 'Too many requests right now. Wait a moment, then try again.',
      canRetry: true,
    };
  }

  if (isForbiddenError(error)) {
    return {
      title: 'Request blocked',
      message:
        'MangaFire blocked this request. Wait a few seconds and try again.',
      canRetry: true,
    };
  }

  if (isNotFoundError(error)) {
    return {
      title: `${label} isn’t available`,
      message:
        'MangaFire no longer has this chapter (it may have been replaced or removed). Go back and open it again from the chapter list.',
      canRetry: true,
    };
  }

  const message = getErrorMessage(error);
  if (
    /chapter .+ not found/i.test(message) ||
    /no pages found for chapter/i.test(message)
  ) {
    return {
      title: `${label} isn’t available`,
      message:
        'This chapter could not be found on MangaFire. Go back and pick another chapter, or try again later.',
      canRetry: true,
    };
  }

  if (/network|timeout|ECONN|ENOTFOUND/i.test(message)) {
    return {
      title: 'Connection problem',
      message: 'Check your internet connection and try again.',
      canRetry: true,
    };
  }

  return {
    title: `Couldn’t load ${label.toLowerCase()}`,
    message: 'Something went wrong while loading pages. You can retry or go back.',
    canRetry: true,
  };
}
