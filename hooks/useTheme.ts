import { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { useAtomValue, useAtomInstance } from '@zedux/react';
import { themeAtom } from '@/atoms/themeAtom';
import { ThemeType } from '@/types/settings';
import { ColorScheme } from '@/constants/Colors';

/**
 * Hook to access theme state and actions.
 *
 * useColorScheme() lives here (not in the atom) to avoid Rules of Hooks violations.
 * Whenever the system color scheme changes, we push the new value into the atom
 * via updateSystemTheme.
 */
export const useTheme = () => {
  const themeState = useAtomValue(themeAtom);
  const themeInstance = useAtomInstance(themeAtom);

  // Observe system color scheme and push changes into the atom
  const systemColorScheme = (useColorScheme() as ColorScheme) || 'light';
  useEffect(() => {
    themeInstance.exports.updateSystemTheme?.(systemColorScheme);
  }, [systemColorScheme, themeInstance]);

  return {
    theme: themeState.theme,
    systemTheme: themeState.systemTheme,
    actualTheme: themeState.actualTheme,
    accentColor: themeState.accentColor,
    setTheme: themeInstance.exports.setTheme,
    toggleTheme: themeInstance.exports.toggleTheme,
    setAccentColor: themeInstance.exports.setAccentColor,
  };
};

// Export type for backwards compatibility
export type Theme = ThemeType;
