// constants/Colors.ts

export const Colors = {
    light: {
      primary: '#007AFF',
      background: '#F2F2F7',
      card: '#FFFFFF',
      text: '#000000',
      border: '#C7C7CC',
      notification: '#FF3B30',
      tint: '#007AFF',
      tabIconDefault: '#C7C7CC',
      tabIconSelected: '#007AFF',
    },
    dark: {
      primary: '#0A84FF',
      background: '#000000',
      card: '#1C1C1E',
      text: '#FFFFFF',
      border: '#38383A',
      notification: '#FF453A',
      tint: '#0A84FF',
      tabIconDefault: '#626262',
      tabIconSelected: '#0A84FF',
    },
  };
  
  export type ColorScheme = keyof typeof Colors;
  export type ThemeColors = typeof Colors.light & typeof Colors.dark;
  