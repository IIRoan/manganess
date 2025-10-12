# Project Structure & Organization

## Root Directory Structure

```
├── app/                    # Expo Router pages and layouts
├── components/             # Reusable UI components
├── constants/              # App constants and configuration
├── hooks/                  # Custom React hooks
├── services/               # API services and business logic
├── types/                  # TypeScript type definitions
├── utils/                  # Utility functions and helpers
├── assets/                 # Static assets (images, fonts)
└── android/                # Native Android configuration
```

## Key Directories

### `/app` - File-based Routing

- `_layout.tsx` - Root layout with providers
- `(tabs)/` - Tab-based navigation screens
- `manga/` - Manga-specific pages
- Individual route files (`.tsx`)

### `/components` - UI Components

- Organized by functionality, not hierarchy
- Each component in its own file
- Naming convention: PascalCase (e.g., `MangaCard.tsx`)
- Complex components may have sub-folders

### `/services` - Business Logic Layer

- API integration services (e.g., `mangaFireService.ts`)
- Data persistence services (e.g., `bookmarkService.ts`)
- External service integrations (e.g., `anilistService.ts`)
- Naming convention: camelCase with "Service" suffix

### `/types` - Type Definitions

- Organized by domain (e.g., `manga.ts`, `auth.ts`)
- Shared interfaces and type unions
- API response types
- Component prop types

### `/hooks` - Custom Hooks

- Reusable stateful logic
- Naming convention: `use` prefix (e.g., `useThemeColor.ts`)
- One hook per file

### `/constants` - Configuration

- App-wide constants and configuration
- Theme definitions and context
- Environment variables
- API endpoints and URLs

### `/utils` - Helper Functions

- Pure utility functions
- Performance monitoring
- Logging utilities
- Network and storage helpers

## File Naming Conventions

- **Components**: PascalCase (e.g., `MangaCard.tsx`)
- **Services**: camelCase with suffix (e.g., `mangaFireService.ts`)
- **Hooks**: camelCase with `use` prefix (e.g., `useSwipeBack.ts`)
- **Types**: camelCase (e.g., `manga.ts`)
- **Utils**: camelCase (e.g., `logger.ts`)
- **Constants**: PascalCase for files, UPPER_CASE for exports

## Import Patterns

- Use absolute imports with `@/` alias for project root
- Group imports: external libraries, then internal modules
- Prefer named exports over default exports for utilities
- Use barrel exports in `index.ts` files where appropriate

## Code Organization Principles

- Separation of concerns: UI, business logic, and data layers
- Single responsibility principle for files and functions
- Co-location of related functionality
- Consistent error handling patterns across services
