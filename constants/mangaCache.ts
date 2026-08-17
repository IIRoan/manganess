/** Shared MangaFire cache window — keep free of service imports to avoid require cycles. */
export const MANGA_CACHE_REFRESH_MIN_INTERVAL_MS = 5 * 60 * 1000;

/** Keep headers for recently opened non-bookmarked manga. Bookmarks are never evicted. */
export const RECENT_MANGA_HEADER_CACHE_LIMIT = 30;

/** Collapse title + chapter persist bursts into one AsyncStorage write. */
export const MANGA_HEADER_PERSIST_DEBOUNCE_MS = 400;
