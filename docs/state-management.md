# State Management Guide

MangaNess uses [Zedux](https://omnistac.github.io/zedux/) for centralized atomic state management. This document covers all atoms, their APIs, how to create new atoms, testing patterns, and DevTools usage.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Atoms Reference](#atoms-reference)
3. [Hooks Reference](#hooks-reference)
4. [Creating New Atoms](#creating-new-atoms)
5. [Testing Atoms](#testing-atoms)
6. [DevTools Usage](#devtools-usage)

---

## Architecture Overview

The Zedux ecosystem is initialized in `app/_layout.tsx` and wraps the entire app via `EcosystemProvider`. All atoms are lazy — they initialize on first use and are cleaned up when no longer needed.

```
EcosystemProvider (app/_layout.tsx)
├── settingsAtom       → persisted to AsyncStorage key: app_settings
├── themeAtom          → derived from settingsAtom + system color scheme
├── networkAtom        → subscribes to NetInfo
├── toastAtom          → ephemeral, auto-hides
├── bookmarkListAtom   → persisted, loads all bookmarks on init
├── bookmarkAtomFamily → per-manga, persisted to manga_${id}
├── downloadManagerAtom → tracks active/paused downloads
├── downloadQueueAtom  → manages download queue + concurrency
└── offlineCacheAtom   → persisted cache for offline browsing
```

### Dependency Graph

```
settingsAtom
  └── themeAtom (reads theme/accentColor from settings)

networkAtom (independent, subscribes to NetInfo)

bookmarkListAtom
  └── bookmarkAtomFamily (per-manga instances)

downloadQueueAtom
  └── downloadManagerAtom (executes queued downloads)

offlineCacheAtom (independent, integrates with networkAtom via hooks)
```

---

## Atoms Reference

### settingsAtom

**File**: `atoms/settingsAtom.ts`  
**Persistence**: `AsyncStorage` key `app_settings`

Manages all app-wide settings with defaults and legacy migration support.

**State shape**:

```typescript
interface SettingsAtomState {
  theme: 'light' | 'dark' | 'system';
  enableDebugTab: boolean;
  onboardingCompleted: boolean;
  accentColor?: string;
  defaultLayout: 'grid' | 'list';
  downloadSettings: DownloadSettings;
}
```

**Exports**:

- `updateSettings(updates: Partial<SettingsAtomState>)` — merges updates into current settings

**Hook**: `hooks/useSettings.ts`

```typescript
const { settings, updateSettings } = useSettings();
```

---

### themeAtom

**File**: `atoms/themeAtom.ts`  
**Persistence**: via `settingsAtom` (nested in `app_settings`)

Manages theme state, reacts to system theme changes, and updates the `Colors` object when accent color changes.

**State shape**:

```typescript
interface ThemeAtomState {
  theme: 'light' | 'dark' | 'system';
  accentColor: string | undefined;
  systemTheme: 'light' | 'dark';
  actualTheme: 'light' | 'dark'; // computed
}
```

**Exports**:

- `setTheme(theme: ThemeType)` — updates theme and persists
- `toggleTheme()` — cycles light → dark → system
- `setAccentColor(color: string | undefined)` — updates accent color

**Hook**: `hooks/useTheme.ts`

```typescript
const {
  actualTheme,
  theme,
  accentColor,
  setTheme,
  toggleTheme,
  setAccentColor,
} = useTheme();
const colors = Colors[actualTheme];
```

---

### networkAtom

**File**: `atoms/networkAtom.ts`  
**Persistence**: none (ephemeral)

Subscribes to NetInfo and provides debounced network status. Only one NetInfo subscription exists regardless of how many components use this atom.

**State shape**:

```typescript
interface NetworkAtomState {
  isOffline: boolean;
  isConnected: boolean;
  networkType: string;
  isInternetReachable: boolean | null;
  showOfflineIndicator: boolean;
}
```

**Debouncing**:

- Going offline: 5 second delay before `isOffline` becomes `true`
- Coming online: `isOffline` clears immediately; `showOfflineIndicator` hides after 2 seconds

**Hook**: `hooks/useOffline.ts`

```typescript
const { isOffline, isConnected, networkType, showOfflineIndicator } =
  useOffline();
```

---

### toastAtom

**File**: `atoms/toastAtom.ts`  
**Persistence**: none (ephemeral)

Manages toast notification display with auto-hide and replacement logic.

**State shape**:

```typescript
interface ToastAtomState {
  config: ToastConfig | null;
  isVisible: boolean;
}
```

**Exports**:

- `showToast(config: ToastConfig)` — shows a toast, replacing any current one
- `hideToast()` — hides the current toast immediately

**Hook**: `hooks/useToast.ts`

```typescript
const { showToast, isVisible, config } = useToast();
showToast({ message: 'Saved!', type: 'success', duration: 2500 });
```

---

### bookmarkListAtom

**File**: `atoms/bookmarkListAtom.ts`  
**Persistence**: `AsyncStorage` keys `bookmarkKeys` + `manga_${id}` per bookmark

Manages the list of all bookmarked manga. Loads all bookmarks from AsyncStorage on initialization.

**State shape**:

```typescript
interface BookmarkListAtomState {
  bookmarks: MangaData[];
  bookmarkKeys: string[]; // backwards compatibility
  lastUpdated: number;
}
```

**Exports**:

- `addBookmark(manga: MangaData)` — adds/updates a bookmark
- `removeBookmark(mangaId: string)` — removes a bookmark
- `refreshBookmarks()` — reloads from AsyncStorage
- `updateBookmarkInList(manga: MangaData)` — updates a single entry in-place

**Hook**: `hooks/useBookmarks.ts`

```typescript
const { bookmarks, addBookmark, removeBookmark } = useBookmarks();
```

**Selectors**: `atoms/selectors/bookmarkSelectors.ts`

```typescript
const count = useBookmarkCount();
const reading = useReadingManga();
const toRead = useToReadManga();
```

---

### bookmarkAtomFamily

**File**: `atoms/bookmarkAtomFamily.ts`  
**Persistence**: `AsyncStorage` key `manga_${id}`

Per-manga atom family. Each manga ID gets its own atom instance with its own persistence.

**State shape**: `MangaData | null`

**Exports**:

- `updateMangaData(updates: Partial<MangaData>)` — merges updates
- `markChaptersAsRead(chapterNumbers: string[])` — adds to readChapters
- `markChapterAsUnread(chapterNumber, currentReadChapters)` — removes from readChapters
- `setMangaData(data: MangaData)` — replaces entire manga data

**Hook**: `hooks/useMangaData.ts`

```typescript
const { mangaData, updateMangaData, markChaptersAsRead } =
  useMangaData(mangaId);
```

---

### downloadManagerAtom

**File**: `atoms/downloadManagerAtom.ts`  
**Persistence**: paused downloads to `AsyncStorage` key `download_manager_paused_contexts`

Tracks active downloads, progress, and paused download contexts. Reacts to app state changes (pauses on background, resumes on foreground).

**State shape**:

```typescript
interface DownloadManagerAtomState {
  activeDownloads: Map<string, DownloadProgressInfo>;
  pausedDownloads: Map<string, PausedDownloadInfo>;
  downloadContexts: Map<string, DownloadContext>;
}
```

**Hook**: `hooks/useDownloadProgress.ts`

```typescript
const { progress, isDownloading } = useDownloadProgress(downloadId);
```

**Selectors**: `atoms/selectors/downloadSelectors.ts`

```typescript
const progress = useDownloadProgress(downloadId);
const allActive = useActiveDownloads();
```

---

### downloadQueueAtom

**File**: `atoms/downloadQueueAtom.ts`  
**Persistence**: queue state to AsyncStorage

Manages the download queue, respects `maxConcurrentDownloads` from settings, and auto-starts next download when one completes.

**State shape**:

```typescript
interface DownloadQueueAtomState {
  queue: DownloadQueueItem[];
  activeDownloadIds: Set<string>;
  isPaused: boolean;
  isProcessing: boolean;
}
```

**Hook**: `hooks/useDownloadQueue.ts`

```typescript
const { queueDownload, clearQueue } = useDownloadQueue();
```

**Selectors**:

```typescript
const { totalItems, activeDownloads, queuedItems, isPaused } = useQueueStatus();
```

---

### offlineCacheAtom

**File**: `atoms/offlineCacheAtom.ts`  
**Persistence**: multiple AsyncStorage keys (see below)

Manages offline cache for manga details, search results, and home data. Implements stale-while-revalidate.

**AsyncStorage keys**:

- `offline_manga_details_cache` — manga details
- `offline_search_cache_${query}` — search results per query
- `offline_home_cache` — home screen data

**Hook**: `hooks/useCachedData.ts`

```typescript
const { cacheMangaDetails, getCachedMangaDetails, cacheSearchResults } =
  useCachedData();
```

**Selectors**: `atoms/selectors/cacheSelectors.ts`

```typescript
const details = useCachedMangaDetails(mangaId);
const results = useCachedSearchResults(query);
const homeData = useCachedHomeData();
```

---

## Hooks Reference

| Hook                  | File                           | Description                                       |
| --------------------- | ------------------------------ | ------------------------------------------------- |
| `useTheme`            | `hooks/useTheme.ts`            | Theme state + setTheme/toggleTheme/setAccentColor |
| `useOffline`          | `hooks/useOffline.ts`          | Network status from networkAtom                   |
| `useToast`            | `hooks/useToast.ts`            | Toast state + showToast                           |
| `useSettings`         | `hooks/useSettings.ts`         | Settings state + updateSettings                   |
| `useBookmarks`        | `hooks/useBookmarks.ts`        | Bookmark list + add/remove                        |
| `useMangaData`        | `hooks/useMangaData.ts`        | Per-manga data + update/markRead                  |
| `useDownloadProgress` | `hooks/useDownloadProgress.ts` | Download progress by ID                           |
| `useDownloadQueue`    | `hooks/useDownloadQueue.ts`    | Queue control                                     |
| `useCachedData`       | `hooks/useCachedData.ts`       | Cache read/write operations                       |

---

## Creating New Atoms

### Basic atom with persistence

```typescript
// atoms/myAtom.ts
import { atom, injectStore, injectEffect, api } from '@zedux/react';
import { asyncStoragePlugin } from '@/atoms/plugins/asyncStoragePlugin';
import { logger } from '@/utils/logger';

interface MyAtomState {
  value: string;
  count: number;
}

const DEFAULT_STATE: MyAtomState = { value: '', count: 0 };

export const myAtom = atom('myAtom', () => {
  const store = injectStore<MyAtomState>(DEFAULT_STATE);

  // Persist to AsyncStorage with 300ms debounce
  injectEffect(() => {
    const plugin = asyncStoragePlugin({
      key: 'my_atom_key',
      debounceMs: 300,
    });
    return plugin(store as any);
  }, []);

  const setValue = (value: string) => {
    store.setState((prev) => ({ ...prev, value }));
  };

  return api(store).setExports({ setValue });
});
```

### Reactive atom (subscribes to external events)

```typescript
// atoms/myReactiveAtom.ts
import { atom, injectStore, injectEffect, api } from '@zedux/react';
import SomeExternalLib from 'some-lib';

export const myReactiveAtom = atom('myReactive', () => {
  const store = injectStore({ data: null });

  injectEffect(() => {
    const unsubscribe = SomeExternalLib.subscribe((data) => {
      store.setState({ data });
    });

    return unsubscribe; // cleanup on atom destroy
  }, []);

  return api(store);
});
```

### Atom family (parameterized by ID)

```typescript
// atoms/myAtomFamily.ts
import { atomFamily, injectStore, api } from '@zedux/react';

export const myAtomFamily = atomFamily('myFamily', (id: string) => {
  const store = injectStore<{ id: string; data: any }>({ id, data: null });

  const update = (data: any) => store.setState((prev) => ({ ...prev, data }));

  return api(store).setExports({ update });
});

// Usage:
// const instance = useAtomInstance(myAtomFamily, [someId]);
// const state = useAtomValue(myAtomFamily, [someId]);
```

### Corresponding hook

```typescript
// hooks/useMyAtom.ts
import { useAtomValue, useAtomInstance } from '@zedux/react';
import { myAtom } from '@/atoms/myAtom';

export const useMyAtom = () => {
  const state = useAtomValue(myAtom);
  const instance = useAtomInstance(myAtom);

  return {
    ...state,
    setValue: instance.exports.setValue as (value: string) => void,
  };
};
```

---

## Testing Atoms

### Test ecosystem setup

Use `createTestEcosystem` from `atoms/testUtils.ts` to create an isolated ecosystem per test:

```typescript
import { createTestEcosystem } from '@/atoms/testUtils';
import { renderHook, act } from '@testing-library/react-native';
import { useMyAtom } from '@/hooks/useMyAtom';

describe('myAtom', () => {
  it('updates value correctly', () => {
    const { wrapper } = createTestEcosystem();

    const { result } = renderHook(() => useMyAtom(), { wrapper });

    act(() => {
      result.current.setValue('hello');
    });

    expect(result.current.value).toBe('hello');
  });
});
```

### Mocking AsyncStorage

```typescript
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);
```

### Property-based tests with fast-check

```typescript
import fc from 'fast-check';
import { renderHook, act } from '@testing-library/react-native';
import { createTestEcosystem } from '@/atoms/testUtils';

// Feature: zedux-state-migration, Property N: Description
it('holds property for all inputs', async () => {
  await fc.assert(
    fc.asyncProperty(fc.string(), async (value) => {
      const { wrapper } = createTestEcosystem();
      const { result } = renderHook(() => useMyAtom(), { wrapper });

      act(() => result.current.setValue(value));

      expect(result.current.value).toBe(value);
    }),
    { numRuns: 100 }
  );
});
```

### Testing async state loading

```typescript
import { waitFor } from '@testing-library/react-native';

it('loads persisted state', async () => {
  await AsyncStorage.setItem(
    'my_atom_key',
    JSON.stringify({ value: 'persisted', count: 5 })
  );

  const { wrapper } = createTestEcosystem();
  const { result } = renderHook(() => useMyAtom(), { wrapper });

  await waitFor(() => {
    expect(result.current.value).toBe('persisted');
  });
});
```

---

## DevTools Usage

Zedux DevTools are enabled automatically in debug mode (when `isDebugEnabled()` returns `true`).

### Enabling debug mode

Set `EXPO_PUBLIC_DEBUG=true` in `.env.development` or use the debug tab in the app.

### What DevTools shows

- All active atom instances and their current state
- State change history with timestamps
- Atom dependency graph
- Ability to inspect and modify state at runtime

### Accessing DevTools

The Zedux ecosystem is configured with `flags: ['@@devtools']` in debug mode. Connect via the Zedux browser extension or use `ecosystem.inspect()` in the JS console during development.

### Debugging tips

```typescript
// In any component or hook, access the ecosystem:
import { useEcosystem } from '@zedux/react';

const ecosystem = useEcosystem();

// Inspect all active atoms:
console.log(ecosystem.findAll());

// Get a specific atom instance:
const instance = ecosystem.find(settingsAtom);
console.log(instance?.getState());
```
