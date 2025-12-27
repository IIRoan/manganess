import {
  checkForUpdate,
  downloadUpdate,
  applyUpdate,
  performFullUpdateFlow,
  isExpoGo,
  isDevelopment,
  areUpdatesAvailable,
  getUnavailableReason,
  isUpdateLocked,
  getUpdateInfo,
} from '../updateService';

jest.mock('expo-updates', () => ({
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
  channel: 'testing',
  runtimeVersion: '1.0.0',
  updateId: 'test-update-id',
  createdAt: new Date('2024-01-01'),
  isEmbeddedLaunch: false,
  isEmergencyLaunch: false,
  checkAutomatically: 'ON_LOAD',
}));

jest.mock('expo-constants', () => ({
  executionEnvironment: 'standalone',
  ExecutionEnvironment: {
    StoreClient: 'storeClient',
    Standalone: 'standalone',
    Bare: 'bare',
  },
}));

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

const Updates = require('expo-updates');
const Constants = require('expo-constants');

describe('updateService', () => {
  const originalDev = __DEV__;

  beforeEach(() => {
    jest.clearAllMocks();
    (globalThis as any).__DEV__ = false;
    Constants.executionEnvironment = 'standalone';
  });

  afterAll(() => {
    (globalThis as any).__DEV__ = originalDev;
  });

  describe('environment detection', () => {
    it('detects Expo Go environment', () => {
      Constants.executionEnvironment = 'storeClient';
      expect(isExpoGo()).toBe(true);

      Constants.executionEnvironment = 'standalone';
      expect(isExpoGo()).toBe(false);
    });

    it('detects development mode', () => {
      (globalThis as any).__DEV__ = true;
      expect(isDevelopment()).toBe(true);

      (globalThis as any).__DEV__ = false;
      expect(isDevelopment()).toBe(false);
    });

    it('correctly reports update availability', () => {
      // In standalone with __DEV__ = false, updates should be available
      Constants.executionEnvironment = 'standalone';
      (globalThis as any).__DEV__ = false;
      expect(areUpdatesAvailable()).toBe(true);

      // In Expo Go, updates should not be available
      Constants.executionEnvironment = 'storeClient';
      expect(areUpdatesAvailable()).toBe(false);

      // In dev mode, updates should not be available
      Constants.executionEnvironment = 'standalone';
      (globalThis as any).__DEV__ = true;
      expect(areUpdatesAvailable()).toBe(false);
    });

    it('provides reason when updates unavailable', () => {
      Constants.executionEnvironment = 'standalone';
      (globalThis as any).__DEV__ = false;
      expect(getUnavailableReason()).toBeNull();

      (globalThis as any).__DEV__ = true;
      expect(getUnavailableReason()).toContain('development');

      (globalThis as any).__DEV__ = false;
      Constants.executionEnvironment = 'storeClient';
      expect(getUnavailableReason()).toContain('Expo Go');
    });
  });

  describe('getUpdateInfo', () => {
    it('returns current update information', () => {
      const info = getUpdateInfo();
      expect(info.channel).toBe('testing');
      expect(info.runtimeVersion).toBe('1.0.0');
      expect(info.updateId).toBe('test-update-id');
    });
  });

  describe('checkForUpdate', () => {
    beforeEach(() => {
      Constants.executionEnvironment = 'standalone';
      (globalThis as any).__DEV__ = false;
    });

    it('short-circuits in development mode', async () => {
      (globalThis as any).__DEV__ = true;

      const result = await checkForUpdate();
      expect(result.success).toBe(false);
      expect(result.message).toContain('development');
      expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
    });

    it('short-circuits in Expo Go', async () => {
      Constants.executionEnvironment = 'storeClient';

      const result = await checkForUpdate();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Expo Go');
      expect(Updates.checkForUpdateAsync).not.toHaveBeenCalled();
    });

    it('reports when an update is available', async () => {
      Updates.checkForUpdateAsync.mockResolvedValue({
        isAvailable: true,
        manifest: { id: 'new-update-id' },
      });

      const result = await checkForUpdate();

      expect(result.success).toBe(true);
      expect(result.message).toBe('Update available');
      expect(result.updateId).toBe('new-update-id');
    });

    it('reports when no update is available', async () => {
      Updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });

      const result = await checkForUpdate();

      expect(result.success).toBe(false);
      expect(result.message).toBe('App is up to date');
    });

    it('returns error message on failure', async () => {
      Updates.checkForUpdateAsync.mockRejectedValue(new Error('Network error'));

      const result = await checkForUpdate();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Network error');
    });
  });

  describe('downloadUpdate', () => {
    beforeEach(() => {
      Constants.executionEnvironment = 'standalone';
      (globalThis as any).__DEV__ = false;
    });

    it('rejects in development mode', async () => {
      (globalThis as any).__DEV__ = true;

      const result = await downloadUpdate();
      expect(result.success).toBe(false);
      expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
    });

    it('downloads and reports new update', async () => {
      Updates.fetchUpdateAsync.mockResolvedValue({ isNew: true });

      const result = await downloadUpdate();
      expect(result.success).toBe(true);
      expect(result.isNew).toBe(true);
    });

    it('reports when downloaded update is not new', async () => {
      Updates.fetchUpdateAsync.mockResolvedValue({ isNew: false });

      const result = await downloadUpdate();
      expect(result.success).toBe(true);
      expect(result.isNew).toBe(false);
    });
  });

  describe('applyUpdate', () => {
    beforeEach(() => {
      Constants.executionEnvironment = 'standalone';
      (globalThis as any).__DEV__ = false;
    });

    it('prevents update on dev mode', async () => {
      (globalThis as any).__DEV__ = true;
      const result = await applyUpdate();
      expect(result.success).toBe(false);
      expect(Updates.reloadAsync).not.toHaveBeenCalled();
    });

    it('reloads app when allowed', async () => {
      Updates.reloadAsync.mockResolvedValue(undefined);

      const result = await applyUpdate();
      expect(Updates.reloadAsync).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });

  describe('performFullUpdateFlow', () => {
    beforeEach(() => {
      Constants.executionEnvironment = 'standalone';
      (globalThis as any).__DEV__ = false;
    });

    it('runs complete flow and updates status callbacks', async () => {
      Updates.checkForUpdateAsync.mockResolvedValue({
        isAvailable: true,
        manifest: { id: 'update-id' },
      });
      Updates.fetchUpdateAsync.mockResolvedValue({ isNew: true });
      Updates.reloadAsync.mockResolvedValue(undefined);

      const statuses: any[] = [];

      const result = await performFullUpdateFlow(
        { forceReload: true },
        (status) => statuses.push({ ...status })
      );

      expect(result.success).toBe(true);
      expect(Updates.checkForUpdateAsync).toHaveBeenCalled();
      expect(Updates.fetchUpdateAsync).toHaveBeenCalled();
      expect(Updates.reloadAsync).toHaveBeenCalled();
      expect(statuses.length).toBeGreaterThan(0);
      expect(statuses[0].isChecking).toBe(true);
    });

    it('returns early when no update available', async () => {
      Updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });

      const result = await performFullUpdateFlow({});

      expect(Updates.checkForUpdateAsync).toHaveBeenCalled();
      expect(Updates.fetchUpdateAsync).not.toHaveBeenCalled();
      expect(result.success).toBe(false);
      expect(result.message).toBe('App is up to date');
    });

    it('prevents duplicate simultaneous calls', async () => {
      // Create a delayed promise
      let resolveCheck: (value: any) => void;
      Updates.checkForUpdateAsync.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveCheck = resolve;
          })
      );

      // Start first call
      const promise1 = performFullUpdateFlow({});

      // Start second call immediately
      const result2 = await performFullUpdateFlow({});

      // Second call should fail due to lock
      expect(result2.success).toBe(false);
      expect(result2.message).toBe('Update already in progress');

      // Resolve first call
      resolveCheck!({ isAvailable: false });
      await promise1;
    });

    it('releases lock after completion', async () => {
      Updates.checkForUpdateAsync.mockResolvedValue({ isAvailable: false });

      await performFullUpdateFlow({});

      // Lock should be released
      expect(isUpdateLocked()).toBe(false);

      // Should be able to start a new flow
      const result = await performFullUpdateFlow({});
      expect(result.message).toBe('App is up to date');
    });

    it('releases lock on error', async () => {
      Updates.checkForUpdateAsync.mockRejectedValue(new Error('Failed'));

      await performFullUpdateFlow({});

      // Lock should be released even on error
      expect(isUpdateLocked()).toBe(false);
    });
  });
});
