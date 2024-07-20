// constants/Colors.ts

export const Colors = {
  light: {
    primary: '#2E8B57',
    background: '#F5F5F5',
    card: '#FFFFFF',
    text: '#333333',
    border: '#E0E0E0',
    notification: '#FF6B6B',
    tint: '#2E8B57',
    tabIconDefault: '#BDBDBD',
    tabIconSelected: '#2E8B57',
    secondaryText: '#757575',
    error: '#FF6B6B',

  },
  dark: {
    primary: '#4CAF50',
    background: '#121212',
    card: '#1f1f1d',
    text: '#E0E0E0',
    border: '#333333',
    notification: '#FF6B6B',
    tint: '#4CAF50',
    tabIconDefault: '#757575',
    tabIconSelected: '#4CAF50',
    secondaryText: '#BDBDBD',
    error: '#FF6B6B',
  },
};

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = typeof Colors.light & typeof Colors.dark;
