import {
  checkForUpdate,
  downloadUpdate,
  applyUpdate,
  performFullUpdateFlow,
} from '../updateService';

jest.mock('expo-updates', () => ({
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const Updates = require('expo-updates');

describe('updateService', () => {
  const originalDev = __DEV__;

  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).__DEV__ = false;
  });

  afterAll(() => {
    (global as any).__DEV__ = originalDev;
  });

  describe('checkForUpdate', () => {
    it('short-circuits in development mode', async () => {
      (global as any).__DEV__ = true;

      const result = await checkForUpdate();
      expect(result).toEqual({
        success: false,
        message: 'Updates are not available in development mode',
      });
      expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
    });

    it('reports when an update is available', async () => {
      Updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });

      const result = await checkForUpdate();

      expect(result).toEqual({ success: true, message: 'Update available' });
    });

    it('returns error message on failure', async () => {
      Updates.checkForUpdateAsync.mockRejectedValue(new Error('boom'));

      const result = await checkForUpdate();
      expect(result.success).toBe(false);
      expect(result.message).toContain('boom');
    });
  });

  describe('downloadUpdate', () => {
    it('rejects in development mode', async () => {
      (global as any).__DEV__ = true;

      const result = await downloadUpdate();
      expect(result).toEqual({
        success: false,
        message: 'Cannot download updates in development mode',
      });
      expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
    });

    it('downloads update when available', async () => {
      (global as any).__DEV__ = false;
      Updates.fetchUpdateAsync.mockResolvedValue(undefined);

      const result = await downloadUpdate();
      expect(result).toEqual({
        success: true,
        message: 'Update downloaded successfully',
      });
    });
  });

  describe('applyUpdate', () => {
    it('prevents update on web or dev', async () => {
      (global as any).__DEV__ = true;
      const devResult = await applyUpdate();
      expect(devResult.success).toBe(false);

      (global as any).__DEV__ = false;
      const reactNative = require('react-native');
      reactNative.Platform.OS = 'web';

      const webResult = await applyUpdate();
      expect(webResult.success).toBe(false);
      expect(Updates.reloadAsync).not.toHaveBeenCalled();

      reactNative.Platform.OS = 'ios';
    });

    it('reloads app when allowed', async () => {
      (global as any).__DEV__ = false;
      const reactNative = require('react-native');
      reactNative.Platform.OS = 'ios';

      const result = await applyUpdate();
      expect(Updates.reloadAsync).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('performFullUpdateFlow', () => {
    it('runs complete flow and updates status callbacks', async () => {
      Updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: true });
      Updates.fetchUpdateAsync.mockResolvedValue(undefined);
      Updates.reloadAsync.mockResolvedValue(undefined);

      const statuses: any[] = [];

      const result = await performFullUpdateFlow(
        { forceReload: true },
        (status) => statuses.push(status)
      );

      expect(result).toEqual({ success: true, message: 'Update applied successfully' });
      expect(Updates.checkForUpdateAsync).toHaveBeenCalled();
      expect(Updates.fetchUpdateAsync).toHaveBeenCalled();
      expect(Updates.reloadAsync).toHaveBeenCalled();
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses[0].isChecking).toBe(true);
    });

    it('propagates failure details and respects silent flag', async () => {
      Updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });

      const result = await performFullUpdateFlow(
        { silent: true },
        jest.fn()
      );

      expect(Updates.checkForUpdateAsync).toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.message).toBe('App is up to date');
    });
  });
});
