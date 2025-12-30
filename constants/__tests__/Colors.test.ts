import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors, updateAccentColor, initializeAccentColor } from '../Colors';

describe('Colors', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    // Reset colors to defaults before each test
    updateAccentColor(undefined);
  });

  describe('Colors constants', () => {
    it('exports light and dark theme colors', () => {
      expect(Colors.light).toBeDefined();
      expect(Colors.dark).toBeDefined();
    });

    it('has required color properties in light theme', () => {
      expect(Colors.light.primary).toBeDefined();
      expect(Colors.light.background).toBeDefined();
      expect(Colors.light.card).toBeDefined();
      expect(Colors.light.text).toBeDefined();
      expect(Colors.light.border).toBeDefined();
      expect(Colors.light.tint).toBeDefined();
      expect(Colors.light.tabIconDefault).toBeDefined();
      expect(Colors.light.tabIconSelected).toBeDefined();
      expect(Colors.light.secondaryText).toBeDefined();
      expect(Colors.light.error).toBeDefined();
    });

    it('has required color properties in dark theme', () => {
      expect(Colors.dark.primary).toBeDefined();
      expect(Colors.dark.background).toBeDefined();
      expect(Colors.dark.card).toBeDefined();
      expect(Colors.dark.text).toBeDefined();
      expect(Colors.dark.border).toBeDefined();
      expect(Colors.dark.tint).toBeDefined();
      expect(Colors.dark.tabIconDefault).toBeDefined();
      expect(Colors.dark.tabIconSelected).toBeDefined();
      expect(Colors.dark.secondaryText).toBeDefined();
      expect(Colors.dark.error).toBeDefined();
    });

    it('has correct default colors for light theme', () => {
      expect(Colors.light.primary).toBe('#2E8B57');
      expect(Colors.light.background).toBe('#F5F5F5');
      expect(Colors.light.tint).toBe('#2E8B57');
      expect(Colors.light.tabIconSelected).toBe('#2E8B57');
    });

    it('has correct default colors for dark theme', () => {
      expect(Colors.dark.primary).toBe('#8FBC8F');
      expect(Colors.dark.background).toBe('#121212');
      expect(Colors.dark.tint).toBe('#3d4a3d');
      expect(Colors.dark.tabIconSelected).toBe('#3d4a3d');
    });
  });

  describe('updateAccentColor', () => {
    it('updates accent colors in light theme when color is provided', () => {
      const customColor = '#FF5733';
      updateAccentColor(customColor);

      expect(Colors.light.primary).toBe(customColor);
      expect(Colors.light.tint).toBe(customColor);
      expect(Colors.light.tabIconSelected).toBe(customColor);
    });

    it('updates accent colors in dark theme when color is provided', () => {
      const customColor = '#FF5733';
      updateAccentColor(customColor);

      expect(Colors.dark.primary).toBe(customColor);
      expect(Colors.dark.tint).toBe(customColor);
      expect(Colors.dark.tabIconSelected).toBe(customColor);
    });

    it('resets light theme to default colors when undefined is provided', () => {
      // First set a custom color
      updateAccentColor('#FF5733');
      expect(Colors.light.primary).toBe('#FF5733');

      // Then reset
      updateAccentColor(undefined);

      expect(Colors.light.primary).toBe('#2E8B57');
      expect(Colors.light.tint).toBe('#2E8B57');
      expect(Colors.light.tabIconSelected).toBe('#2E8B57');
    });

    it('resets dark theme to default colors when undefined is provided', () => {
      // First set a custom color
      updateAccentColor('#FF5733');
      expect(Colors.dark.primary).toBe('#FF5733');

      // Then reset
      updateAccentColor(undefined);

      expect(Colors.dark.primary).toBe('#8FBC8F');
      expect(Colors.dark.tint).toBe('#3d4a3d');
      expect(Colors.dark.tabIconSelected).toBe('#3d4a3d');
    });

    it('accepts color scheme parameter', () => {
      const customColor = '#123456';
      updateAccentColor(customColor, 'dark');

      // Should still update both themes
      expect(Colors.light.primary).toBe(customColor);
      expect(Colors.dark.primary).toBe(customColor);
    });

    it('handles empty string as no color', () => {
      updateAccentColor('#FF5733');
      updateAccentColor('');

      // Empty string is falsy, should reset to defaults
      expect(Colors.light.primary).toBe('#2E8B57');
      expect(Colors.dark.primary).toBe('#8FBC8F');
    });
  });

  describe('initializeAccentColor', () => {
    it('loads accent color from AsyncStorage settings', async () => {
      const settings = { accentColor: '#AABBCC' };
      await AsyncStorage.setItem('app_settings', JSON.stringify(settings));

      await initializeAccentColor();

      expect(Colors.light.primary).toBe('#AABBCC');
      expect(Colors.dark.primary).toBe('#AABBCC');
    });

    it('does not update colors when settings has no accentColor', async () => {
      // Reset to default first
      updateAccentColor(undefined);
      const defaultLightPrimary = Colors.light.primary;

      const settings = { theme: 'dark' };
      await AsyncStorage.setItem('app_settings', JSON.stringify(settings));

      await initializeAccentColor();

      expect(Colors.light.primary).toBe(defaultLightPrimary);
    });

    it('does not update colors when no settings stored', async () => {
      updateAccentColor(undefined);
      const defaultLightPrimary = Colors.light.primary;

      await initializeAccentColor();

      expect(Colors.light.primary).toBe(defaultLightPrimary);
    });

    it('handles JSON parse error gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      await AsyncStorage.setItem('app_settings', 'invalid-json');

      // Should not throw
      await expect(initializeAccentColor()).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading accent color:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('handles AsyncStorage error gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      await expect(initializeAccentColor()).resolves.not.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error loading accent color:',
        expect.any(Error)
      );
      consoleSpy.mockRestore();
    });

    it('applies accent color from settings with accentColor property', async () => {
      const settings = {
        theme: 'system',
        accentColor: '#00FF00',
        enableDebugTab: false
      };
      await AsyncStorage.setItem('app_settings', JSON.stringify(settings));

      await initializeAccentColor();

      expect(Colors.light.primary).toBe('#00FF00');
      expect(Colors.light.tint).toBe('#00FF00');
      expect(Colors.light.tabIconSelected).toBe('#00FF00');
      expect(Colors.dark.primary).toBe('#00FF00');
      expect(Colors.dark.tint).toBe('#00FF00');
      expect(Colors.dark.tabIconSelected).toBe('#00FF00');
    });
  });
});
