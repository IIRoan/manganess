# Technology Stack & Build System

## Core Technologies

- **React Native 0.81.4** with **React 19.1.0**
- **Expo SDK 54** with Expo Router for navigation
- **TypeScript** with strict configuration
- **Bun** as package manager and runtime

## Key Libraries & Frameworks

- **Navigation**: Expo Router with typed routes, React Navigation
- **UI Components**: React Native Reanimated, Gesture Handler, Bottom Sheet
- **Storage**: AsyncStorage for local data persistence
- **HTTP Client**: Axios for API requests
- **Performance**: Custom performance monitoring utilities
- **Theming**: Custom theme context with system theme support
- **External Integration**: AniList API for manga tracking

## Development Tools

- **Linting**: ESLint with Expo config
- **Formatting**: Prettier (single quotes, 2 spaces, 80 char width)
- **Type Checking**: Strict TypeScript with comprehensive compiler options

## Common Commands

### Development

```bash
bun start          # Start Expo development server
bun run startlocal # Start with localhost only
bun run dev        # Start with dev client
bun run android    # Run on Android
bun run ios        # Run on iOS
```

### Code Quality

```bash
bun run lint:fix   # Fix ESLint issues
bun run check      # Run both lint and typecheck
bun run format:check  # Check Prettier formatting
bun run format:write  # Apply Prettier formatting
bun run test # Run tests
```

### Building

```bash
bun run build        # Build Android preview
bun run build:ios    # Build iOS preview
bun run build:android # Build Android preview
bun run prebuild     # Clean prebuild
bun run export       # Export static files
```

## Architecture Notes

- Uses Expo's new architecture (newArchEnabled: true)
- File-based routing with Expo Router
- Context-based state management for themes and settings
- Service layer pattern for API interactions
- Custom hooks for reusable logic
- Error boundaries for crash prevention
