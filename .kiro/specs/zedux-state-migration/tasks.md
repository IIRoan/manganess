# Implementation Plan: Zedux State Migration

## Overview

This implementation plan outlines the tasks for migrating MangaNess from decentralized state management (React Context, service singletons, event emitters) to a centralized atomic state management system using Zedux. The migration will be performed in 7 phases over 8 weeks, with each phase building incrementally on the previous one. All tasks involve writing, modifying, or testing code.

## Tasks

- [x] 1. Phase 1: Foundation Setup
  - [x] 1.1 Install Zedux and configure dependencies
    - Install @zedux/react package
    - Update package.json and install dependencies
    - _Requirements: 1.1_

  - [x] 1.2 Create Zedux ecosystem in root layout
    - Initialize ecosystem in app/\_layout.tsx
    - Configure ecosystem with id and DevTools based on isDebugEnabled()
    - Wrap app content with EcosystemProvider
    - _Requirements: 1.2, 1.3, 1.4_

  - [x] 1.3 Create AsyncStorage persistence plugin
    - Implement asyncStoragePlugin in atoms/plugins/asyncStoragePlugin.ts
    - Support configurable key, debounce, serialize/deserialize
    - Handle loading initial state from AsyncStorage
    - Handle persisting state changes with debouncing
    - Integrate error logging with logger utility
    - _Requirements: 12.1, 12.2, 12.3_

  - [ ]\* 1.4 Write property test for AsyncStorage persistence plugin
    - **Property 31: AsyncStorage Persistence**
    - **Validates: Requirements 12.1**

  - [ ]\* 1.5 Write property test for debounced persistence
    - **Property 32: Debounced Persistence**
    - **Validates: Requirements 12.2**

  - [x] 1.6 Create atom state type definitions
    - Create types/atoms.ts with all atom state interfaces
    - Define ThemeAtomState, NetworkAtomState, ToastAtomState, etc.
    - _Requirements: 15.1_

  - [x] 1.7 Create test utilities for Zedux
    - Implement createTestEcosystem in atoms/testUtils.ts
    - Implement clearTestStorage helper
    - Implement mockAsyncStorage helper
    - _Requirements: 17.1, 17.2, 17.3_

- [x] 2. Phase 2: Simple Atoms Migration
  - [x] 2.1 Create Toast atom
    - Implement toastAtom in atoms/toastAtom.ts
    - Implement showToast export function
    - Implement auto-hide logic with setTimeout
    - Implement toast replacement logic
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x] 2.2 Create useToast hook
    - Implement hooks/useToast.ts wrapping toastAtom
    - Maintain same API as ToastContext
    - _Requirements: 4.1_

  - [ ]\* 2.3 Write property test for toast auto-hide
    - **Property 7: Toast Auto-Hide**
    - **Validates: Requirements 4.2**

  - [ ]\* 2.4 Write property test for toast replacement
    - **Property 8: Toast Replacement**
    - **Validates: Requirements 4.3**

  - [ ]\* 2.5 Write unit test for toast cleanup
    - Test that toast configuration is cleared after hiding
    - _Requirements: 4.4_

  - [x] 2.6 Create Network atom
    - Implement networkAtom in atoms/networkAtom.ts
    - Subscribe to NetInfo in injectEffect
    - Implement debouncing logic for offline status (5s) and indicator (2s)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 2.7 Create useOffline hook
    - Implement hooks/useOffline.ts wrapping networkAtom
    - Maintain same API as OfflineContext
    - _Requirements: 3.5_

  - [ ]\* 2.8 Write property test for network debouncing
    - **Property 5: Network Status Debouncing**
    - **Validates: Requirements 3.2, 3.3, 3.4**

  - [ ]\* 2.9 Write property test for single NetInfo subscription
    - **Property 6: Single NetInfo Subscription**
    - **Validates: Requirements 3.5**

  - [x] 2.10 Create Settings atom
    - Implement settingsAtom in atoms/settingsAtom.ts
    - Use asyncStoragePlugin with key 'app_settings'
    - Implement default values for missing settings
    - Implement legacy migration (searchLayout → defaultLayout)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 2.11 Create useSettings hook
    - Implement hooks/useSettings.ts wrapping settingsAtom
    - Export updateSettings function
    - _Requirements: 6.2_

  - [ ]\* 2.12 Write property test for settings persistence
    - **Property 14: Settings Persistence**
    - **Validates: Requirements 6.2**

  - [ ]\* 2.13 Write property test for settings defaults
    - **Property 15: Settings Defaults**
    - **Validates: Requirements 6.3, 6.4**

  - [ ]\* 2.14 Write unit test for legacy settings migration
    - Test that searchLayout is migrated to defaultLayout
    - _Requirements: 6.5_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [-] 4. Phase 3: Theme System Migration
  - [x] 4.1 Create Theme atom
    - Implement themeAtom in atoms/themeAtom.ts
    - Subscribe to useColorScheme for system theme changes
    - Compute actualTheme based on theme setting and system theme
    - Integrate with Colors.updateAccentColor when accent color changes
    - Use asyncStoragePlugin for persistence (nested in settings)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 4.2 Create useTheme hook
    - Implement hooks/useTheme.ts wrapping themeAtom
    - Export setTheme, setAccentColor, toggleTheme functions
    - Maintain same API as ThemeContext
    - _Requirements: 2.5_

  - [ ]\* 4.3 Write property test for theme persistence round trip
    - **Property 2: Theme Persistence Round Trip**
    - **Validates: Requirements 2.2, 2.4**

  - [ ]\* 4.4 Write property test for system theme reactivity
    - **Property 3: System Theme Reactivity**
    - **Validates: Requirements 2.3**

  - [ ]\* 4.5 Write property test for selective re-rendering
    - **Property 4: Selective Re-rendering**
    - **Validates: Requirements 2.6, 10.4, 14.1**

  - [x] 4.6 Migrate components from ThemeContext to useTheme
    - Update all components using ThemeContext
    - Replace useTheme from ThemeContext with new useTheme hook
    - Test each component after migration
    - _Requirements: 2.5, 13.2_

  - [x] 4.7 Remove ThemeContext provider
    - Remove ThemeProvider from app/\_layout.tsx
    - Remove constants/ThemeContext.tsx file
    - _Requirements: 13.5_

- [x] 5. Phase 4: Bookmark System Migration
  - [x] 5.1 Create Bookmark List atom
    - Implement bookmarkListAtom in atoms/bookmarkListAtom.ts
    - Load all bookmarks from AsyncStorage on initialization
    - Maintain bookmarkKeys array for backwards compatibility
    - Implement addBookmark, removeBookmark exports
    - Set bookmarkChanged flag on updates
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_

  - [x] 5.2 Create Bookmark atom family
    - Implement bookmarkAtomFamily in atoms/bookmarkAtomFamily.ts
    - Use asyncStoragePlugin with key `manga_${id}`
    - Implement updateMangaData, markChaptersAsRead exports
    - Notify parent bookmarkListAtom on changes
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ]\* 5.3 Write property test for bookmark persistence
    - **Property 10: Bookmark Persistence**
    - **Validates: Requirements 5.2, 5.3, 5.5**

  - [ ]\* 5.4 Write property test for read chapters update
    - **Property 11: Read Chapters Update**
    - **Validates: Requirements 5.4**

  - [ ]\* 5.5 Write property test for bookmark change flag
    - **Property 12: Bookmark Change Flag**
    - **Validates: Requirements 5.6**

  - [x] 5.6 Create bookmark selectors
    - Implement atoms/selectors/bookmarkSelectors.ts
    - Create bookmarkCountSelector
    - Create readingMangaSelector
    - Create toReadMangaSelector
    - _Requirements: 5.1_

  - [x] 5.7 Create bookmark hooks
    - Implement hooks/useBookmarks.ts
    - Implement hooks/useMangaData.ts
    - Export bookmark manipulation functions
    - _Requirements: 5.2, 5.3, 5.4_

  - [ ]\* 5.8 Write property test for offline cache trigger
    - **Property 13: Offline Cache Trigger**
    - **Validates: Requirements 5.7**

  - [x] 5.9 Migrate bookmark-related components
    - Update app/(tabs)/bookmarks.tsx to use new hooks
    - Update app/(tabs)/manga/[id].tsx to use new hooks
    - Update components/SwipeChapterItem.tsx
    - Test bookmark functionality thoroughly
    - _Requirements: 13.2, 13.4_

  - [x] 5.10 Deprecate bookmarkService
    - Add deprecation comments to services/bookmarkService.ts
    - Ensure no components are using old service
    - _Requirements: 13.5_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Phase 5: Download System Migration (Part 1)
  - [x] 7.1 Create Download Manager atom
    - Implement downloadManagerAtom in atoms/downloadManagerAtom.ts
    - Track activeDownloads, pausedDownloads, downloadContexts
    - Implement startDownload, pauseDownload, resumeDownload exports
    - Persist paused downloads to AsyncStorage
    - Subscribe to AppState for background/foreground handling
    - _Requirements: 7.1, 7.2, 7.5, 7.7, 7.8_

  - [x] 7.2 Implement download progress tracking
    - Update progress entries on download events
    - Calculate progress percentage, download speed, ETA
    - Emit progress updates to subscribers
    - _Requirements: 7.2_

  - [x] 7.3 Implement download completion handling
    - Mark downloads as complete
    - Update manga's downloadedChapters array
    - Clean up download context
    - _Requirements: 7.3_

  - [x] 7.4 Implement download error handling
    - Store error information
    - Determine if download should be paused or failed based on error type
    - Integrate with logger for error logging
    - _Requirements: 7.4, 18.4, 18.5_

  - [ ]\* 7.5 Write property test for download progress tracking
    - **Property 16: Download Progress Tracking**
    - **Validates: Requirements 7.2**

  - [ ]\* 7.6 Write property test for download completion
    - **Property 17: Download Completion**
    - **Validates: Requirements 7.3**

  - [ ]\* 7.7 Write property test for download error handling
    - **Property 18: Download Error Handling**
    - **Validates: Requirements 7.4**

  - [ ]\* 7.8 Write property test for download pause persistence
    - **Property 19: Download Pause Persistence**
    - **Validates: Requirements 7.5**

  - [ ]\* 7.9 Write property test for download restoration
    - **Property 20: Download Restoration**
    - **Validates: Requirements 7.6**

  - [ ]\* 7.10 Write property test for app state download management
    - **Property 21: App State Download Management**
    - **Validates: Requirements 7.7, 7.8**

- [x] 8. Phase 5: Download System Migration (Part 2)
  - [x] 8.1 Create Download Queue atom
    - Implement downloadQueueAtom in atoms/downloadQueueAtom.ts
    - Track queue, activeDownloadIds, isPaused, isProcessing
    - Implement queueDownload, clearQueue exports
    - Respect max concurrent downloads from settings atom
    - Auto-start next download when one completes
    - _Requirements: 8.1, 8.2, 8.3_

  - [x] 8.2 Implement queue retry logic
    - Handle failed downloads with retry based on error type
    - Update queue status appropriately
    - _Requirements: 8.4_

  - [ ]\* 8.3 Write property test for queue concurrent limit
    - **Property 22: Queue Concurrent Limit**
    - **Validates: Requirements 8.2**

  - [ ]\* 8.4 Write property test for queue auto-start
    - **Property 23: Queue Auto-Start**
    - **Validates: Requirements 8.3**

  - [ ]\* 8.5 Write property test for queue retry logic
    - **Property 24: Queue Retry Logic**
    - **Validates: Requirements 8.4**

  - [ ]\* 8.6 Write unit test for queue clear
    - Test that clearing queue cancels all pending downloads
    - _Requirements: 8.5_

  - [x] 8.7 Create download selectors
    - Implement atoms/selectors/downloadSelectors.ts
    - Create downloadProgressSelector(downloadId)
    - Create activeDownloadsSelector
    - Create queueStatusSelector
    - _Requirements: 7.2, 8.1_

  - [x] 8.8 Create download hooks
    - Implement hooks/useDownloadProgress.ts
    - Implement hooks/useDownloadQueue.ts
    - Export download control functions
    - _Requirements: 7.1, 8.1_

  - [x] 8.9 Replace downloadEventEmitter with atom subscriptions
    - Update components to subscribe to download atoms instead of events
    - Remove event emitter imports
    - Test that all download events still trigger correct updates
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

  - [ ]\* 8.10 Write property test for event system replacement
    - **Property 29: Event System Replacement**
    - **Validates: Requirements 11.2, 11.3, 11.4**

  - [ ]\* 8.11 Write property test for update batching
    - **Property 30: Update Batching**
    - **Validates: Requirements 11.5, 14.4**

  - [x] 8.12 Migrate download-related components
    - Update app/downloads.tsx to use new hooks
    - Update app/(tabs)/manga/[id].tsx download UI
    - Update components/BatchDownloadHost.tsx
    - Test download functionality thoroughly
    - _Requirements: 13.2, 13.4_

  - [x] 8.13 Update batch download orchestrator
    - Modify services/batchDownloadOrchestrator.ts to use atoms
    - Replace internal state with atom subscriptions
    - _Requirements: 11.2_

  - [x] 8.14 Remove downloadEventEmitter
    - Delete utils/downloadEventEmitter.ts
    - Ensure no imports remain
    - _Requirements: 11.1, 13.5_

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Phase 6: Offline Cache Migration
  - [x] 10.1 Create Offline Cache atom
    - Implement offlineCacheAtom in atoms/offlineCacheAtom.ts
    - Track mangaDetailsCache, searchCache, homeCache
    - Persist to AsyncStorage with appropriate keys
    - Implement stale-while-revalidate pattern
    - Integrate with network atom for offline detection
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 10.2 Implement cache expiration logic
    - Check timestamps on cache access
    - Return null for expired cache entries
    - Clean up expired entries periodically
    - _Requirements: 9.4_

  - [ ]\* 10.3 Write property test for cache key consistency
    - **Property 25: Cache Key Consistency**
    - **Validates: Requirements 9.1, 9.2**

  - [ ]\* 10.4 Write property test for cache expiration
    - **Property 26: Cache Expiration**
    - **Validates: Requirements 9.4**

  - [ ]\* 10.5 Write property test for stale-while-revalidate
    - **Property 27: Stale-While-Revalidate**
    - **Validates: Requirements 9.5**

  - [x] 10.6 Create cache selectors
    - Implement atoms/selectors/cacheSelectors.ts
    - Create cachedMangaDetailsSelector(mangaId)
    - Create cachedSearchResultsSelector(query)
    - Create cachedHomeDataSelector
    - _Requirements: 9.4_

  - [x] 10.7 Create cache hooks
    - Implement hooks/useCachedData.ts
    - Export cache manipulation functions
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 10.8 Migrate components using offline cache
    - Update app/(tabs)/index.tsx to use cache hooks
    - Update app/(tabs)/mangasearch.tsx to use cache hooks
    - Update app/(tabs)/manga/[id].tsx to use cache hooks
    - Test offline functionality thoroughly
    - _Requirements: 13.2, 13.4_

  - [x] 10.9 Deprecate offlineCacheService
    - Add deprecation comments to services/offlineCacheService.ts
    - Ensure no components are using old service
    - _Requirements: 13.5_

- [x] 11. Phase 7: Cleanup and Optimization
  - [x] 11.1 Remove deprecated Context providers
    - Remove OfflineProvider from app/\_layout.tsx
    - Remove ToastProvider from app/\_layout.tsx
    - Delete contexts/OfflineContext.tsx
    - Delete contexts/ToastContext.tsx
    - _Requirements: 13.5_

  - [x] 11.2 Remove deprecated service singletons
    - Delete services/bookmarkService.ts (or mark as fully deprecated)
    - Delete services/offlineCacheService.ts (or mark as fully deprecated)
    - Update any remaining imports
    - _Requirements: 13.5_

  - [x] 11.3 Optimize atom dependencies
    - Review atom dependency graph
    - Optimize selectors for performance
    - Add memoization where needed
    - _Requirements: 14.2_

  - [ ]\* 11.4 Write property test for atom cleanup
    - **Property 28: Atom Cleanup**
    - **Validates: Requirements 10.5**

  - [ ]\* 11.5 Write property test for storage key consistency
    - **Property 37: Storage Key Consistency**
    - **Validates: Requirements 13.3**

  - [ ]\* 11.6 Write property test for update semantics preservation
    - **Property 38: Update Semantics Preservation**
    - **Validates: Requirements 13.4**

  - [ ]\* 11.7 Write property test for async storage non-blocking
    - **Property 39: Async Storage Non-Blocking**
    - **Validates: Requirements 14.3**

  - [ ]\* 11.8 Write property test for critical state priority
    - **Property 40: Critical State Priority**
    - **Validates: Requirements 14.5**

  - [x] 11.9 Create Reanimated sync utility
    - Implement utils/reanimatedSync.ts
    - Create useSyncAtomToSharedValue hook
    - Test with toast and bookmark animations
    - _Requirements: 19.1, 19.5_

  - [ ]\* 11.10 Write unit test for Reanimated integration
    - Test that shared values sync with atom updates
    - _Requirements: 19.1, 19.5_

  - [ ]\* 11.11 Write unit tests for error handling
    - Test initialization fallback with default values
    - Test update failure reversion
    - Test error logging integration
    - _Requirements: 18.2, 18.3, 18.5_

  - [x] 11.12 Performance testing and benchmarking
    - Measure render times before and after migration
    - Measure AsyncStorage operation times
    - Ensure no performance regression
    - Use performanceMonitor for measurements
    - _Requirements: 14.1, 14.3, 14.5_

  - [x] 11.13 Create state management documentation
    - Document all atoms and their APIs in docs/state-management.md
    - Document how to create new atoms
    - Document testing patterns
    - Document DevTools usage
    - _Requirements: 20.1, 20.2, 20.3, 20.4_

  - [x] 11.14 Add inline code documentation
    - Add JSDoc comments to all atoms
    - Add comments explaining complex atom logic
    - Document atom dependencies
    - _Requirements: 20.5_

- [x] 12. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties
- Unit tests validate specific examples and edge cases
- Migration is designed to be incremental with backwards compatibility at each phase
- Old code is kept alongside new code until migration is complete and tested
