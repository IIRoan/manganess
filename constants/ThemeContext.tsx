import React, { createContext, useState, useContext, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { ColorScheme, Colors, updateAccentColor } from '@/constants/Colors';
import { getAppSettings, setAppSettings } from '@/services/settingsService';
import { ThemeType } from '@/types';

interface ThemeContextType {
  theme: ThemeType;
  systemTheme: ColorScheme;
  setTheme: (theme: ThemeType | ((prevTheme: ThemeType) => ThemeType)) => void;
  toggleTheme: () => void;
  actualTheme: 'light' | 'dark';
  accentColor: string | undefined;
  setAccentColor: (color: string | undefined) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setThemeState] = useState<ThemeType>('system');
  const [accentColor, setAccentColorState] = useState<string | undefined>(
    undefined
  );
  const systemColorScheme = useColorScheme() as ColorScheme;

  useEffect(() => {
    loadSavedSettings();
  }, []);

  const loadSavedSettings = async () => {
    try {
      const settings = await getAppSettings();
      if (settings?.theme) {
        setThemeState(settings.theme);
      }
      if (settings?.accentColor) {
        setAccentColorState(settings.accentColor);
      }
    } catch (error) {
      console.error('Error loading saved settings:', error);
    }
  };

  const setTheme = async (
    newTheme: ThemeType | ((prevTheme: ThemeType) => ThemeType)
  ) => {
    try {
      const currentSettings = await getAppSettings();

      // Handle both direct value and function that uses previous value
      const resolvedTheme =
        typeof newTheme === 'function' ? newTheme(theme) : newTheme;

      // Batch the state and settings update
      setThemeState(resolvedTheme);

      // Update settings in background
      setAppSettings({
        ...currentSettings,
        theme: resolvedTheme,
      }).catch((error) => {
        console.error('Error saving theme to storage:', error);
        // Revert state if storage fails
        setThemeState(theme);
      });
    } catch (error) {
      console.error('Error saving theme:', error);
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
      const currentSettings = await getAppSettings();

      // Update state immediately for better UX
      setAccentColorState(color);

      // Update colors object directly
      updateAccentColor(
        color,
        theme === 'system' ? systemColorScheme : (theme as ColorScheme)
      );

      // Save to storage in background
      setAppSettings({
        ...currentSettings,
        accentColor: color,
      }).catch((error) => {
        console.error('Error saving accent color to storage:', error);
        // Could revert accent color state here if needed
      });
    } catch (error) {
      console.error('Error saving accent color:', error);
    }
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        systemTheme: systemColorScheme,
        setTheme,
        toggleTheme,
        actualTheme:
          theme === 'system' ? systemColorScheme : (theme as 'light' | 'dark'),
        accentColor,
        setAccentColor,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

export type Theme = ThemeType;
