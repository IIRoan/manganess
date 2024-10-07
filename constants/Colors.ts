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
    primary: '#8FBC8F',
    background: '#121212',
    card: '#121212',
    text: '#E0E0E0',
    border: '#333333',
    notification: '#FF6B6B',
    tint: '#3d4a3d',
    tabIconDefault: '#757575',
    tabIconSelected: '#3d4a3d',
    secondaryText: '#BDBDBD',
    error: '#FF6B6B',
  },
};

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = typeof Colors.light & typeof Colors.dark;
