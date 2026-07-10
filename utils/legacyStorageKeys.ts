const BOOKMARK_KEYS_KEY = 'bookmarkKeys';
const BOOKMARK_CHANGED_KEY = 'bookmarkChanged';

export function isLegacyBookmarkSplitKey(key: string): boolean {
  if (key === BOOKMARK_KEYS_KEY || key === BOOKMARK_CHANGED_KEY) {
    return false;
  }

  return key.startsWith('bookmark_');
}

export function isLegacySplitStorageKey(key: string): boolean {
  if (isLegacyBookmarkSplitKey(key)) {
    return true;
  }

  if (key.startsWith('title_') || key.startsWith('image_')) {
    return true;
  }

  return /^manga_.+_read_chapters$/.test(key);
}

export function isOrphanedLegacySplitKey(
  key: string,
  allKeys: readonly string[]
): boolean {
  if (key.startsWith('title_') || key.startsWith('image_')) {
    const id = key.replace(/^(title|image)_/, '');
    return (
      !allKeys.includes(`bookmark_${id}`) && !allKeys.includes(`manga_${id}`)
    );
  }

  if (/^manga_.+_read_chapters$/.test(key)) {
    const id = key.replace(/^manga_/, '').replace(/_read_chapters$/, '');
    return (
      !allKeys.includes(`bookmark_${id}`) && !allKeys.includes(`manga_${id}`)
    );
  }

  return false;
}
