import {
  atom,
  injectStore,
  injectEffect,
  injectAtomInstance,
  api,
} from '@zedux/react';
import { ThemeAtomState } from '@/types/atoms';
import { ColorScheme, updateAccentColor } from '@/constants/Colors';
import { ThemeType } from '@/types/settings';
import { logger } from '@/utils/logger';
import { settingsAtom } from '@/atoms/settingsAtom';

/**
 * Theme Atom
 *
 * Manages theme state (light/dark/system) and accent color. Derives `actualTheme`
 * from the user's theme preference and the system color scheme.
 *
 * Key behaviors:
 * - Reads initial theme/accentColor from settingsAtom on creation
 * - System color scheme is injected via `updateSystemTheme` (called from useTheme hook)
 *   to avoid calling useColorScheme() inside the atom factory (Rules of Hooks violation)
 * - Syncs with settingsAtom changes (subscribes to settings store)
 * - Calls `updateAccentColor` on the Colors object when accent changes
 * - `setTheme` accepts both a value and an updater function (like setState)
 *
 * Dependencies: settingsAtom (reads/writes theme + accentColor)
 * Persistence: via settingsAtom → AsyncStorage key `app_settings`
 *
 * @see hooks/useTheme.ts for React hook access (useColorScheme lives there)
 * @see atoms/settingsAtom.ts for persistence
 * @see Requirements 2.1–2.6
 */
export const themeAtom = atom('theme', () => {
  // Get settings atom to read/write theme and accent color
  const settingsInstance = injectAtomInstance(settingsAtom);
  const settings = settingsInstance.getState();

  // Initialize state with values from settings
  // System color scheme starts as 'light' and is updated by useTheme hook
  // via updateSystemTheme export — this avoids calling useColorScheme() here
  const initialTheme = settings.theme || 'system';
  const initialAccentColor = settings.accentColor;
  const initialActualTheme: 'light' | 'dark' =
    initialTheme === 'system' ? 'light' : (initialTheme as 'light' | 'dark');

  const store = injectStore<ThemeAtomState>({
    theme: initialTheme,
    accentColor: initialAccentColor,
    systemTheme: 'light',
    actualTheme: initialActualTheme,
  });

  // Apply accent color on initialization
  if (initialAccentColor) {
    updateAccentColor(initialAccentColor, initialActualTheme);
  }

  // Subscribe to settings changes to sync theme and accent color
  injectEffect(() => {
    const subscription = settingsInstance.store.subscribe({
      effects: ({ newState }: any) => {
        const currentThemeState = store.getState();

        // Check if theme or accent color changed in settings
        if (
          newState.theme !== currentThemeState.theme ||
          newState.accentColor !== currentThemeState.accentColor
        ) {
          const newActualTheme: 'light' | 'dark' =
            newState.theme === 'system'
              ? currentThemeState.systemTheme
              : (newState.theme as 'light' | 'dark');

          store.setState({
            theme: newState.theme,
            accentColor: newState.accentColor,
            systemTheme: currentThemeState.systemTheme,
            actualTheme: newActualTheme,
          });

          // Update Colors object when accent color changes
          if (newState.accentColor !== currentThemeState.accentColor) {
            updateAccentColor(newState.accentColor, newActualTheme);
          }
        }
      },
    });

    return () => subscription.unsubscribe();
  }, []);

  /**
   * Called by useTheme hook whenever useColorScheme() changes.
   * Keeping useColorScheme() in the hook (not the atom) avoids Rules of Hooks violations.
   */
  const updateSystemTheme = (systemColorScheme: ColorScheme) => {
    const currentState = store.getState();
    if (currentState.systemTheme === systemColorScheme) return;

    const newActualTheme: 'light' | 'dark' =
      currentState.theme === 'system'
        ? systemColorScheme
        : (currentState.theme as 'light' | 'dark');

    store.setState({
      ...currentState,
      systemTheme: systemColorScheme,
      actualTheme: newActualTheme,
    });

    if (currentState.accentColor) {
      updateAccentColor(currentState.accentColor, newActualTheme);
    }

    logger().info('UI', 'System theme changed', {
      systemTheme: systemColorScheme,
      actualTheme: newActualTheme,
    });
  };

  const setTheme = async (
    newTheme: ThemeType | ((prevTheme: ThemeType) => ThemeType)
  ) => {
    try {
      const currentState = store.getState();

      // Handle both direct value and function that uses previous value
      const resolvedTheme =
        typeof newTheme === 'function'
          ? newTheme(currentState.theme)
          : newTheme;

      // Calculate new actualTheme
      const newActualTheme: 'light' | 'dark' =
        resolvedTheme === 'system'
          ? currentState.systemTheme
          : (resolvedTheme as 'light' | 'dark');

      // Update theme atom state
      store.setState({
        ...currentState,
        theme: resolvedTheme,
        actualTheme: newActualTheme,
      });

      // Update accent color with new theme
      if (currentState.accentColor) {
        updateAccentColor(currentState.accentColor, newActualTheme);
      }

      // Persist to settings atom, including explicit reset to undefined
      settingsInstance.exports.updateSettings({
        theme: resolvedTheme,
      });

      logger().info('UI', 'Theme changed', {
        theme: resolvedTheme,
        actualTheme: newActualTheme,
      });
    } catch (error) {
      logger().error('UI', 'Failed to set theme', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  const toggleTheme = () => {
    setTheme((prevTheme: ThemeType): ThemeType => {
      switch (prevTheme) {
        case 'light':
          return 'dark';
        case 'dark':
          return 'system';
        case 'system':
          return 'light';
        default:
          return 'system';
      }
    });
  };

  const setAccentColor = async (color: string | undefined) => {
    try {
      const currentState = store.getState();

      // Update theme atom state
      store.setState({
        ...currentState,
        accentColor: color,
      });

      // Update Colors object directly
      updateAccentColor(color, currentState.actualTheme);

      // Persist to settings atom, including explicit reset to undefined
      settingsInstance.exports.updateSettings({
        accentColor: color,
      });

      logger().info('UI', 'Accent color changed', {
        accentColor: color,
      });
    } catch (error) {
      logger().error('UI', 'Failed to set accent color', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return api(store).setExports({
    setTheme,
    toggleTheme,
    setAccentColor,
    updateSystemTheme,
  });
});


