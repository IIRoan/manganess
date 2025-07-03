import AsyncStorage from '@react-native-async-storage/async-storage';

// Define a mutable colors object that can be updated at runtime
let dynamicColors = {
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

// Export as if it were a constant - all external users see this as a normal constant
export const Colors = dynamicColors;

export type ColorScheme = keyof typeof Colors;
export type ThemeColors = typeof Colors.light & typeof Colors.dark;

// Function to update accent color at runtime
export function updateAccentColor(
  accentColor: string | undefined,
  _colorScheme: ColorScheme = 'light'
): void {
  if (accentColor) {
    // Update light theme
    dynamicColors.light.primary = accentColor;
    dynamicColors.light.tint = accentColor;
    dynamicColors.light.tabIconSelected = accentColor;

    // Update dark theme
    dynamicColors.dark.primary = accentColor;
    dynamicColors.dark.tint = accentColor;
    dynamicColors.dark.tabIconSelected = accentColor;
  } else {
    // Reset to default colors
    dynamicColors.light.primary = '#2E8B57';
    dynamicColors.light.tint = '#2E8B57';
    dynamicColors.light.tabIconSelected = '#2E8B57';

    dynamicColors.dark.primary = '#8FBC8F';
    dynamicColors.dark.tint = '#3d4a3d';
    dynamicColors.dark.tabIconSelected = '#3d4a3d';
  }
}

// Load accent color from AsyncStorage at app startup
export async function initializeAccentColor(): Promise<void> {
  try {
    const settingsStr = await AsyncStorage.getItem('app_settings');
    if (settingsStr) {
      const settings = JSON.parse(settingsStr);
      if (settings.accentColor) {
        updateAccentColor(settings.accentColor);
      }
    }
  } catch (error) {
    console.error('Error loading accent color:', error);
  }
}

// Initialize colors when this module is imported
initializeAccentColor().catch((err) =>
  console.error('Failed to initialize accent color:', err)
);
