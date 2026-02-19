# Requirements Document: Zedux State Migration

## Introduction

This document specifies the requirements for migrating all state management in the MangaNess React Native application from the current decentralized approach (React Context, custom hooks, service singletons, and component-local state) to a centralized atomic state management system using Zedux. The migration aims to improve maintainability, testability, and developer experience while preserving all existing functionality and performance characteristics.

## Glossary

- **Zedux**: An atomic state management library for React applications that provides composable atoms, dependency injection, and powerful DevTools
- **Atom**: A self-contained unit of state in Zedux that can have dependencies, side effects, and computed values
- **AtomInstance**: A specific instantiation of an atom with its current state and lifecycle
- **AtomSelector**: A derived value computed from one or more atoms
- **Store**: The Zedux store that manages all atoms and their dependencies
- **Ecosystem**: A Zedux container that holds stores and provides dependency injection
- **AsyncStorage**: React Native's persistent key-value storage system
- **State_Manager**: The centralized Zedux-based state management system
- **Context_Provider**: React Context API providers (ThemeContext, OfflineContext, ToastContext)
- **Service_Layer**: Singleton services that manage AsyncStorage operations (bookmarkService, settingsService, etc.)
- **Event_Emitter**: The downloadEventEmitter used for cross-component communication
- **Migration_Phase**: A discrete stage of the migration process
- **Reanimated**: React Native Reanimated library for animations
- **NetInfo**: React Native NetInfo library for network status monitoring

## Requirements

### Requirement 1: Zedux Installation and Configuration

**User Story:** As a developer, I want Zedux properly installed and configured in the project, so that I can begin migrating state management to atoms.

#### Acceptance Criteria

1. WHEN the project dependencies are installed, THE System SHALL include @zedux/react package at the latest stable version
2. WHEN the application initializes, THE System SHALL create a Zedux ecosystem at the root level
3. WHEN the Zedux ecosystem is created, THE System SHALL configure it with appropriate options for React Native
4. WHERE development mode is enabled, THE System SHALL enable Zedux DevTools integration
5. WHEN TypeScript compilation occurs, THE System SHALL have proper type definitions for all Zedux APIs

### Requirement 2: Theme State Migration

**User Story:** As a user, I want my theme preferences to persist and apply correctly, so that my visual experience remains consistent across app sessions.

#### Acceptance Criteria

1. WHEN the app initializes, THE Theme_Atom SHALL load theme settings from AsyncStorage
2. WHEN a user changes the theme setting, THE Theme_Atom SHALL update immediately and persist to AsyncStorage
3. WHEN the system theme changes, THE Theme_Atom SHALL detect the change and update if theme is set to 'system'
4. WHEN a user changes the accent color, THE Theme_Atom SHALL update the color scheme and persist to AsyncStorage
5. WHEN any component accesses theme state, THE System SHALL provide the current theme without prop drilling
6. WHEN theme state updates, THE System SHALL trigger re-renders only in components that consume theme state

### Requirement 3: Network Status State Migration

**User Story:** As a user, I want accurate network status information, so that I understand when I'm offline and can access downloaded content.

#### Acceptance Criteria

1. WHEN the app initializes, THE Network_Atom SHALL subscribe to NetInfo for network status updates
2. WHEN network connectivity changes, THE Network_Atom SHALL update state with debouncing (5 seconds for offline, 2 seconds for online indicator)
3. WHEN the app goes offline, THE Network_Atom SHALL set isOffline to true after the debounce period
4. WHEN the app comes online, THE Network_Atom SHALL set isOffline to false immediately and hide the offline indicator after debounce
5. WHEN any component needs network status, THE System SHALL provide current network state without creating multiple NetInfo subscriptions

### Requirement 4: Toast Notification State Migration

**User Story:** As a user, I want to see toast notifications for important events, so that I receive feedback on my actions.

#### Acceptance Criteria

1. WHEN a toast is triggered, THE Toast_Atom SHALL store the toast configuration and set visibility to true
2. WHEN a toast is displayed, THE Toast_Atom SHALL automatically hide it after the specified duration
3. WHEN a new toast is triggered while one is visible, THE Toast_Atom SHALL replace the current toast with the new one
4. WHEN a toast is hidden, THE Toast_Atom SHALL clear the toast configuration
5. WHEN toast state updates, THE System SHALL maintain compatibility with existing Reanimated animations

### Requirement 5: Bookmark State Migration

**User Story:** As a user, I want my bookmarks and reading progress to persist reliably, so that I don't lose track of my manga collection.

#### Acceptance Criteria

1. WHEN the app initializes, THE Bookmark_Atom SHALL load all bookmark data from AsyncStorage
2. WHEN a user bookmarks a manga, THE Bookmark*Atom SHALL update state and persist to AsyncStorage with key `manga*${id}`
3. WHEN a user removes a bookmark, THE Bookmark_Atom SHALL remove the manga from state and delete from AsyncStorage
4. WHEN a user marks chapters as read, THE Bookmark_Atom SHALL update read chapters array and persist changes
5. WHEN bookmark data changes, THE Bookmark_Atom SHALL update the bookmarkKeys array for backwards compatibility
6. WHEN bookmark data changes, THE Bookmark_Atom SHALL set the bookmarkChanged flag in AsyncStorage
7. WHEN a manga is bookmarked, THE Bookmark_Atom SHALL trigger offline cache storage for the manga details

### Requirement 6: Settings State Migration

**User Story:** As a user, I want my app settings to persist across sessions, so that my preferences are maintained.

#### Acceptance Criteria

1. WHEN the app initializes, THE Settings_Atom SHALL load settings from AsyncStorage key 'app_settings'
2. WHEN a user changes any setting, THE Settings_Atom SHALL update state and persist to AsyncStorage immediately
3. WHEN settings are loaded, THE Settings_Atom SHALL provide default values for missing settings
4. WHEN download settings are accessed, THE Settings_Atom SHALL ensure default download settings exist
5. WHEN the default layout setting is accessed, THE Settings_Atom SHALL migrate from legacy searchLayout if needed

### Requirement 7: Download Manager State Migration

**User Story:** As a user, I want reliable chapter downloads with progress tracking, so that I can read manga offline.

#### Acceptance Criteria

1. WHEN a download starts, THE Download_Atom SHALL create a download progress entry with initial state
2. WHEN download progress updates, THE Download_Atom SHALL update the progress entry and emit progress events
3. WHEN a download completes, THE Download_Atom SHALL mark it as complete and update the manga's downloaded chapters
4. WHEN a download fails, THE Download_Atom SHALL store the error and mark it as failed or paused based on error type
5. WHEN a download is paused, THE Download_Atom SHALL persist the download context to AsyncStorage for resume capability
6. WHEN the app restarts, THE Download_Atom SHALL restore paused downloads from AsyncStorage
7. WHEN the app goes to background, THE Download_Atom SHALL pause all active downloads
8. WHEN the app returns to foreground, THE Download_Atom SHALL resume paused downloads that were paused due to app state

### Requirement 8: Download Queue State Migration

**User Story:** As a user, I want downloads to be queued and processed efficiently, so that I can download multiple chapters without overwhelming the system.

#### Acceptance Criteria

1. WHEN a download is queued, THE Download_Queue_Atom SHALL add it to the queue with pending status
2. WHEN the queue processes, THE Download_Queue_Atom SHALL respect the max concurrent downloads setting
3. WHEN a download completes, THE Download_Queue_Atom SHALL start the next queued download if capacity allows
4. WHEN a download fails, THE Download_Queue_Atom SHALL update its status and optionally retry based on error type
5. WHEN the queue is cleared, THE Download_Queue_Atom SHALL cancel all pending downloads

### Requirement 9: Offline Cache State Migration

**User Story:** As a user, I want cached manga data available offline, so that I can browse my bookmarks without internet.

#### Acceptance Criteria

1. WHEN manga details are cached, THE Offline_Cache_Atom SHALL store them in AsyncStorage with key `offline_manga_details_cache`
2. WHEN search results are cached, THE Offline*Cache_Atom SHALL store them with key `offline_search_cache*${query}`
3. WHEN home data is cached, THE Offline_Cache_Atom SHALL store it with key `offline_home_cache`
4. WHEN cached data is accessed, THE Offline_Cache_Atom SHALL return cached data if available and not expired
5. WHEN the app is online, THE Offline_Cache_Atom SHALL implement stale-while-revalidate pattern for cache updates

### Requirement 10: Component State Migration

**User Story:** As a developer, I want component-specific state managed consistently, so that state logic is predictable and testable.

#### Acceptance Criteria

1. WHEN a component needs local UI state, THE System SHALL use Zedux atoms for state that needs to be shared or persisted
2. WHEN a component needs ephemeral UI state, THE System SHALL use React useState for truly local state (e.g., modal visibility)
3. WHEN multiple components need the same state, THE System SHALL use Zedux atoms to avoid prop drilling
4. WHEN component state updates, THE System SHALL trigger re-renders only in components that consume that specific state
5. WHEN a component unmounts, THE System SHALL clean up atom instances if they are no longer needed

### Requirement 11: Event System Replacement

**User Story:** As a developer, I want to replace the event emitter system with Zedux subscriptions, so that state changes are reactive and type-safe.

#### Acceptance Criteria

1. WHEN a download event occurs, THE System SHALL update the relevant Zedux atom instead of emitting an event
2. WHEN components need to react to download changes, THE System SHALL subscribe to the Download_Atom
3. WHEN the downloadEventEmitter is removed, THE System SHALL maintain all existing event-driven functionality through atom subscriptions
4. WHEN state changes propagate, THE System SHALL ensure the same components update as with the event system
5. WHEN multiple components listen to the same state, THE System SHALL efficiently batch updates

### Requirement 12: AsyncStorage Integration

**User Story:** As a developer, I want seamless AsyncStorage integration with Zedux atoms, so that state persists automatically.

#### Acceptance Criteria

1. WHEN an atom with persistence is created, THE System SHALL load initial state from AsyncStorage
2. WHEN persisted atom state changes, THE System SHALL debounce writes to AsyncStorage to avoid excessive I/O
3. WHEN AsyncStorage operations fail, THE System SHALL log errors and continue with in-memory state
4. WHEN the app initializes, THE System SHALL handle AsyncStorage loading asynchronously without blocking render
5. WHEN multiple atoms persist to AsyncStorage, THE System SHALL batch writes when possible

### Requirement 13: Migration Compatibility

**User Story:** As a developer, I want to migrate incrementally, so that I can test each migration phase without breaking the app.

#### Acceptance Criteria

1. WHEN a migration phase begins, THE System SHALL support both old and new state management approaches simultaneously
2. WHEN an atom is migrated, THE System SHALL maintain the same API surface for consuming components
3. WHEN AsyncStorage keys are accessed, THE System SHALL use the same keys as the current implementation
4. WHEN state updates occur, THE System SHALL maintain the same update semantics as the current implementation
5. WHEN the migration is complete, THE System SHALL have removed all old state management code

### Requirement 14: Performance Requirements

**User Story:** As a user, I want the app to remain fast and responsive, so that the migration doesn't degrade my experience.

#### Acceptance Criteria

1. WHEN atoms update, THE System SHALL trigger re-renders only in components that consume the changed state
2. WHEN expensive computations are needed, THE System SHALL use atom selectors to memoize results
3. WHEN AsyncStorage operations occur, THE System SHALL perform them asynchronously without blocking the UI
4. WHEN multiple state updates occur, THE System SHALL batch updates to minimize re-renders
5. WHEN the app initializes, THE System SHALL load critical state first and defer non-critical state loading

### Requirement 15: Type Safety Requirements

**User Story:** As a developer, I want full TypeScript support, so that I catch state-related bugs at compile time.

#### Acceptance Criteria

1. WHEN atoms are defined, THE System SHALL provide full type inference for atom state
2. WHEN atom selectors are used, THE System SHALL infer return types correctly
3. WHEN atom actions are called, THE System SHALL type-check parameters
4. WHEN atoms are composed, THE System SHALL maintain type safety across dependencies
5. WHEN hooks are used, THE System SHALL provide proper TypeScript types for all return values

### Requirement 16: DevTools Integration

**User Story:** As a developer, I want debugging tools for state management, so that I can diagnose issues quickly.

#### Acceptance Criteria

1. WHERE development mode is enabled, THE System SHALL enable Zedux DevTools
2. WHEN state changes occur, THE DevTools SHALL show the atom that changed and the new value
3. WHEN atoms have dependencies, THE DevTools SHALL visualize the dependency graph
4. WHEN time-travel debugging is used, THE System SHALL restore previous state correctly
5. WHEN DevTools are disabled in production, THE System SHALL have no performance impact

### Requirement 17: Testing Support

**User Story:** As a developer, I want to test components with Zedux state easily, so that I can maintain high test coverage.

#### Acceptance Criteria

1. WHEN tests are written, THE System SHALL provide utilities to create test ecosystems
2. WHEN atoms are tested, THE System SHALL allow mocking atom state
3. WHEN components are tested, THE System SHALL allow providing custom atom values
4. WHEN async atoms are tested, THE System SHALL provide utilities to wait for state updates
5. WHEN integration tests run, THE System SHALL allow resetting all atom state between tests

### Requirement 18: Error Handling

**User Story:** As a user, I want graceful error handling, so that state errors don't crash the app.

#### Acceptance Criteria

1. WHEN AsyncStorage operations fail, THE System SHALL log the error and continue with in-memory state
2. WHEN atom initialization fails, THE System SHALL provide fallback default values
3. WHEN atom updates fail, THE System SHALL revert to previous state and notify the user
4. WHEN network requests fail, THE System SHALL update atom state to reflect the error
5. WHEN errors occur, THE System SHALL integrate with the existing logger utility

### Requirement 19: Reanimated Compatibility

**User Story:** As a user, I want smooth animations, so that the UI feels polished and responsive.

#### Acceptance Criteria

1. WHEN Reanimated shared values are used, THE System SHALL integrate with Zedux atoms for state-driven animations
2. WHEN toast animations run, THE System SHALL maintain the existing Reanimated animation behavior
3. WHEN bookmark swipe animations run, THE System SHALL maintain the existing Reanimated gesture handling
4. WHEN state updates trigger animations, THE System SHALL ensure animations run on the UI thread
5. WHEN atoms update, THE System SHALL provide a way to sync with Reanimated shared values

### Requirement 20: Documentation Requirements

**User Story:** As a developer, I want clear documentation, so that I understand how to use the new state management system.

#### Acceptance Criteria

1. WHEN the migration is complete, THE System SHALL have documentation for all atoms and their APIs
2. WHEN new features are added, THE System SHALL have examples of how to create new atoms
3. WHEN debugging is needed, THE System SHALL have documentation for using DevTools
4. WHEN testing is needed, THE System SHALL have examples of testing components with Zedux
5. WHEN the codebase is reviewed, THE System SHALL have inline comments explaining complex atom logic
