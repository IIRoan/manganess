# MangaNess AI Agent Development Guide

## Project Overview

MangaNess is a React Native manga reading application built with Expo SDK 54, featuring a clean, ad-free reading experience with AniList integration, bookmark management, and comprehensive theming support.

### Core Technologies

- **React Native 0.81.4** with **React 19.1.0**
- **Expo SDK 54** with Expo Router for file-based navigation
- **TypeScript** with strict configuration
- **Bun** as package manager and runtime
- **AsyncStorage** for local data persistence
- **Axios** for HTTP requests

## Architecture Overview

### File-Based Routing Structure

```
app/
├── _layout.tsx                 # Root layout with providers
├── (tabs)/                     # Tab-based navigation
│   ├── _layout.tsx            # Tab layout with swipe gestures
│   ├── index.tsx              # Home screen
│   ├── mangasearch.tsx        # Search functionality
│   ├── bookmarks.tsx          # Bookmark management
│   ├── settings.tsx           # App settings
│   └── manga/[id]/            # Dynamic manga routes
│       ├── index.tsx          # Manga details page
│       └── chapter/[chapterNumber].tsx  # Chapter reader
```

### Core Directory Structure

- **`/components`** - Reusable UI components
- **`/services`** - Business logic and API integrations
- **`/hooks`** - Custom React hooks
- **`/types`** - TypeScript type definitions
- **`/constants`** - App constants and configuration
- **`/utils`** - Utility functions and helpers

## Component Architecture Pattern

Every component follows this structure:

```typescript
// 1. Imports (grouped and ordered)
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Colors } from '@/constants/Colors';

// 2. Type definitions
interface ComponentProps {
  title: string;
  onPress?: () => void;
  disabled?: boolean;
}

// 3. Main component function
export default function ComponentName({ title, onPress, disabled }: ComponentProps) {
  // 4. Theme and styling (always first)
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const styles = getStyles(colors);

  // 5. State management
  const [loading, setLoading] = useState(false);

  // 6. Memoized values and callbacks
  const handlePress = useCallback(() => {
    if (disabled || loading) return;
    onPress?.();
  }, [disabled, loading, onPress]);

  // 7. Effects
  useEffect(() => {
    // Side effects
  }, []);

  // 8. Main render
  return (
    <Pressable style={[styles.container]} onPress={handlePress}>
      <Text style={styles.title}>{title}</Text>
    </Pressable>
  );
}

// 9. Styles function (always at bottom)
const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    borderRadius: 8,
    padding: 16,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
});
```

## Theme System

### Theme Context Usage

Every component must use the theme system:

```typescript
const { actualTheme, theme, setTheme, accentColor } = useTheme();
const colors = Colors[actualTheme]; // 'light' | 'dark'
const styles = getStyles(colors);
```

### Styling Function Pattern

```typescript
const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    // Container styles first
    container: { backgroundColor: colors.background },
    // Text styles grouped
    title: { color: colors.text, fontSize: 24 },
    // Interactive elements
    button: { backgroundColor: colors.primary },
  });
```

## Data Models & Types

### Primary Data Types

- **MangaItem** - Search results (`types/manga.ts`)
- **MangaDetails** - Full manga information (`types/manga.ts`)
- **MangaData** - Storage model (`types/manga.ts`)
- **BookmarkStatus** - 'To Read' | 'Reading' | 'Read' | 'On Hold'
- **Chapter** - Chapter information (`types/manga.ts`)

### Error Types

- **ErrorType** enum - Network, Validation, Cache, Parsing, etc. (`types/errors.ts`)
- **Custom Error Classes** - MangaNetworkError, MangaValidationError, etc.

## Critical Utilities & Services

### Logger System

- **File**: `utils/logger.ts`
- **Usage**: Import `logger()` for all debugging and monitoring
- **Scopes**: 'Navigation', 'Network', 'Service', 'Storage', 'UI'
- **Features**: Performance measurement, async operation tracking, buffered logging

### Performance Monitoring

- **File**: `utils/performance.ts`
- **Usage**: Import `performanceMonitor` and `useRenderTime` hook
- **Features**: Component render timing, async operation measurement, metrics collection

### Haptic Feedback

- **File**: `utils/haptics.ts`
- **Usage**: Import `hapticFeedback` service or `useHapticFeedback` hook
- **Types**: Light, Medium, Heavy, Success, Warning, Error, Selection

### Network Monitoring

- **File**: `utils/networkMonitor.ts`
- **Usage**: Call `installNetworkMonitor(axios)` in app initialization
- **Features**: Automatic request/response logging, timing, error tracking

## Service Layer

### MangaFireService

- **File**: `services/mangaFireService.ts`
- **Purpose**: Main API integration for manga data
- **Features**: HTML parsing, caching, Cloudflare detection, retry logic

### BookmarkService

- **File**: `services/bookmarkService.ts`
- **Purpose**: Local bookmark and reading progress management
- **Features**: AsyncStorage operations, data consistency, migration support

### AniList Integration

- **File**: `services/anilistService.ts`
- **Purpose**: External manga tracking service integration
- **Features**: OAuth authentication, status synchronization, bulk operations

### Settings Service

- **File**: `services/settingsService.ts`
- **Purpose**: App configuration and data management
- **Features**: Theme settings, data export/import, storage migration

## Custom Hooks

### Navigation Hooks

- **useNavigationHistory** - History management (`hooks/useNavigationHistory.ts`)
- **useSwipeBack** - Gesture-based navigation (`hooks/useSwipeBack.ts`)

### Theme Hooks

- **useTheme** - Theme atom access (`hooks/useTheme.ts`)
- **useThemeColor** - Color resolution (`hooks/useThemeColor.ts`)

### Utility Hooks

- **useHapticFeedback** - Haptic feedback integration (`utils/haptics.ts`)
- **useRenderTime** - Performance measurement (`utils/performance.ts`)

## Key Components

### UI Components

- **MangaCard** - Manga display card (`components/MangaCard.tsx`)
- **Alert** - Custom modal alerts (`components/Alert.tsx`)
- **BackButton** - Navigation back button (`components/BackButton.tsx`)
- **SwipeChapterItem** - Swipeable chapter list item (`components/SwipeChapterItem.tsx`)

### Layout Components

- **ErrorBoundary** - Error catching and fallback (`components/ErrorBoundary.tsx`)
- **ThemedText/ThemedView** - Theme-aware base components

## Development Guidelines

### File Naming Conventions

- **Components**: PascalCase (e.g., `MangaCard.tsx`)
- **Services**: camelCase with suffix (e.g., `mangaFireService.ts`)
- **Hooks**: camelCase with `use` prefix (e.g., `useSwipeBack.ts`)
- **Types**: camelCase (e.g., `manga.ts`)
- **Utils**: camelCase (e.g., `logger.ts`)

### Import Organization

1. React and React Native imports
2. Third-party library imports
3. Internal imports (grouped by type)
4. Relative imports (avoid if possible)

### Error Handling Requirements

1. Always use try-catch for async operations
2. Log all errors with appropriate scope and context
3. Use proper error types from the error system
4. Implement retry logic for network operations
5. Provide user-friendly error messages

### Performance Requirements

1. Use React.memo for expensive components
2. Implement useCallback for event handlers
3. Use useMemo for expensive calculations
4. Implement proper list optimization with FlatList
5. Monitor performance with the performance monitor

### Accessibility Requirements

1. Add accessibility labels to all interactive elements
2. Use proper accessibility roles
3. Support screen readers
4. Test with accessibility tools

## Testing Patterns

### Component Testing

- **Location**: `__tests__/components/`
- **Tools**: Jest, React Native Testing Library
- **Pattern**: Test behavior, not implementation

### Service Testing

- **Location**: `__tests__/services/`
- **Tools**: Jest with mocks
- **Pattern**: Mock external dependencies, test business logic

## Build & Deployment

### EAS Configuration

- **File**: `eas.json`
- **Profiles**: development, preview, production
- **Environment**: Variables in `constants/env.ts`

### Scripts

- **Development**: `bun start`, `bun android`, `bun ios`
- **Building**: `bun run build`, `bun run build:ios`
- **Quality**: `bun run lint`, `bun run type-check` , `bun run test`

## Key Patterns to Follow

1. **Always use the theme system** - No hardcoded colors
2. **Log all operations** - Use appropriate scopes and context
3. **Handle errors properly** - Try-catch, logging, user feedback
4. **Optimize performance** - Memoization, proper list handling
5. **Follow accessibility guidelines** - Labels, roles, screen reader support
6. **Use TypeScript strictly** - Proper types, no `any`
7. **Test thoroughly** - Components and services
8. **Document complex logic** - Comments for future maintainers

## When Working with Existing Code

- **Read the actual file** for implementation details
- **Follow established patterns** in similar components
- **Use existing utilities** rather than creating new ones
- **Maintain consistency** with the codebase style
- **Test changes thoroughly** before submitting

This guide provides the essential information for working with the MangaNess codebase. For specific implementation details, always refer to the actual source files.
