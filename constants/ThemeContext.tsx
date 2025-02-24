// constants/ThemeContext.tsx - Updated to use ThemeType from types

import React, { createContext, useState, useContext, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { ColorScheme } from '@/constants/Colors';
import { getAppSettings, setAppSettings } from '@/services/settingsService';
import { ThemeType } from '@/types';

interface ThemeContextType {
  theme: ThemeType;
  systemTheme: ColorScheme;
  setTheme: (theme: ThemeType) => void;
  toggleTheme: () => void;
  actualTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeType>('system');
  const systemColorScheme = useColorScheme() as ColorScheme;

  useEffect(() => {
    loadSavedTheme();
  }, []);

  const loadSavedTheme = async () => {
    try {
      const settings = await getAppSettings();
      if (settings?.theme) {
        setThemeState(settings.theme);
      }
    } catch (error) {
      console.error('Error loading saved theme:', error);
    }
  };

  const setTheme = async (newTheme: ThemeType) => {
    try {
      await setAppSettings({
        theme: newTheme,
        enableDebugTab: false,
        onboardingCompleted: false
      });
      setThemeState(newTheme);
    } catch (error) {
      console.error('Error saving theme:', error);
    }
  };

  const toggleTheme = () => {
    //@ts-ignore
    setTheme(prevTheme => {
      switch (prevTheme) {
        case 'light': return 'dark';
        case 'dark': return 'system';
        case 'system': return 'light';
      }
    });
  };

  const actualTheme = theme === 'system' ? systemColorScheme : theme;

  return (
    <ThemeContext.Provider value={{
      theme,
      systemTheme: systemColorScheme,
      setTheme,
      toggleTheme,
      actualTheme
    }}>
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