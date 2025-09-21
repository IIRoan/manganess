# Repository Guidelines

## Project Structure & Module Organization

- `app/` holds Expo Router entry points; tabs live under `app/(tabs)/` with feature-specific screens and nested routes.
- Shared UI primitives sit in `components/`; cross-cutting logic is grouped in `hooks/`, `services/`, `utils/`, and typed contracts in `types/`.
- Static assets (icons, splash art) stay in `assets/`; keep generated build artefacts out of version control per `.gitignore`.

## Build, Test & Development Commands

- Run `bun run check` before pushing to execute linting, type-checking, and CI-mode tests; `bun run reset-project` restores a clean Expo state.

## Coding Style & Naming Conventions

- TypeScript is mandatory; keep modules typed and favour explicit return types for exported functions.
- Prettier enforces 2-space indentation, semicolons, 80-character wraps, and single quotes (`bun run format:write`); ESLint (`expo lint`) guards Expo/React Native best practices.
- Name components in `PascalCase`, hooks in `useCamelCase`, and files matching their default export (e.g., `MangaCard.tsx`).

## Testing Guidelines

- Jest with the `jest-expo` preset powers unit tests; prefer colocating specs beside the implementation or under `__tests__/`.
- Use `bun run test` for watch mode during development; `bun run test:ci` captures coverage for pull requests.

## Commit & Pull Request Guidelines

- Follow the existing history: short, imperative summaries (`Add bookmark indicator`, `Fix type errors`) and scope-specific commits.
- PRs should describe the user-facing change, call out affected routes or services, link issues, and attach emulator screenshots for UI updates.
- Include validation snippets (commands run, platforms exercised) and confirm `bun run check` passes before requesting review.

## Environment & Configuration Tips

- App metadata lives in `app.json` and `eas.json`; update both when changing bundle identifiers or build profiles.
- Secrets stay out of source control; consume them via Expo's secure storage or EAS secrets, never hard-code credentials.
