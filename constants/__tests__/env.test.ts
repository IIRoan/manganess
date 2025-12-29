describe('env', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('isDebugEnabled', () => {
    it('returns true when EXPO_PUBLIC_DEBUG is "true"', () => {
      process.env.EXPO_PUBLIC_DEBUG = 'true';
      const { isDebugEnabled } = require('../env');
      expect(isDebugEnabled()).toBe(true);
    });

    it('returns true when EXPO_PUBLIC_DEBUG is "TRUE" (case insensitive)', () => {
      process.env.EXPO_PUBLIC_DEBUG = 'TRUE';
      const { isDebugEnabled } = require('../env');
      expect(isDebugEnabled()).toBe(true);
    });

    it('returns true when EXPO_PUBLIC_DEBUG is "True" (mixed case)', () => {
      process.env.EXPO_PUBLIC_DEBUG = 'True';
      const { isDebugEnabled } = require('../env');
      expect(isDebugEnabled()).toBe(true);
    });

    it('returns false when EXPO_PUBLIC_DEBUG is "false"', () => {
      process.env.EXPO_PUBLIC_DEBUG = 'false';
      delete process.env.debug;
      const { isDebugEnabled } = require('../env');
      expect(isDebugEnabled()).toBe(false);
    });

    it('returns true when debug env var is "true" and EXPO_PUBLIC_DEBUG is not set', () => {
      delete process.env.EXPO_PUBLIC_DEBUG;
      process.env.debug = 'true';
      const { isDebugEnabled } = require('../env');
      expect(isDebugEnabled()).toBe(true);
    });

    it('returns true when debug is "TRUE" (case insensitive)', () => {
      delete process.env.EXPO_PUBLIC_DEBUG;
      process.env.debug = 'TRUE';
      const { isDebugEnabled } = require('../env');
      expect(isDebugEnabled()).toBe(true);
    });

    it('returns false when debug is "false"', () => {
      delete process.env.EXPO_PUBLIC_DEBUG;
      process.env.debug = 'false';
      const { isDebugEnabled } = require('../env');
      expect(isDebugEnabled()).toBe(false);
    });

    it('returns false when neither env var is set', () => {
      delete process.env.EXPO_PUBLIC_DEBUG;
      delete process.env.debug;
      const { isDebugEnabled } = require('../env');
      expect(isDebugEnabled()).toBe(false);
    });

    it('returns false when EXPO_PUBLIC_DEBUG is empty string', () => {
      process.env.EXPO_PUBLIC_DEBUG = '';
      delete process.env.debug;
      const { isDebugEnabled } = require('../env');
      expect(isDebugEnabled()).toBe(false);
    });

    it('returns false when debug is empty string', () => {
      delete process.env.EXPO_PUBLIC_DEBUG;
      process.env.debug = '';
      const { isDebugEnabled } = require('../env');
      expect(isDebugEnabled()).toBe(false);
    });

    it('EXPO_PUBLIC_DEBUG takes priority over debug', () => {
      process.env.EXPO_PUBLIC_DEBUG = 'true';
      process.env.debug = 'false';
      const { isDebugEnabled } = require('../env');
      expect(isDebugEnabled()).toBe(true);
    });

    it('falls back to debug when EXPO_PUBLIC_DEBUG is not "true"', () => {
      process.env.EXPO_PUBLIC_DEBUG = 'false';
      process.env.debug = 'true';
      const { isDebugEnabled } = require('../env');
      expect(isDebugEnabled()).toBe(true);
    });

    it('returns false on error (catch block)', () => {
      // Create a proxy that throws when accessing EXPO_PUBLIC_DEBUG
      const throwingEnv = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === 'EXPO_PUBLIC_DEBUG') {
              throw new Error('Simulated error');
            }
            return undefined;
          },
        }
      );

      // Temporarily replace process.env
      const savedEnv = process.env;
      Object.defineProperty(process, 'env', {
        value: throwingEnv,
        configurable: true,
      });

      try {
        const { isDebugEnabled } = require('../env');
        expect(isDebugEnabled()).toBe(false);
      } finally {
        // Restore process.env
        Object.defineProperty(process, 'env', {
          value: savedEnv,
          configurable: true,
        });
      }
    });
  });

  describe('appStartTs', () => {
    it('is a number', () => {
      const { appStartTs } = require('../env');
      expect(typeof appStartTs).toBe('number');
    });

    it('is a positive value', () => {
      const { appStartTs } = require('../env');
      expect(appStartTs).toBeGreaterThan(0);
    });

    it('is less than or equal to current time', () => {
      const { appStartTs } = require('../env');
      const now = Date.now();
      // appStartTs could be from performance.now() (small number) or Date.now() (large number)
      // Either way it should have been captured before now
      expect(appStartTs).toBeLessThanOrEqual(now);
    });

    it('falls back to Date.now() when performance.now() is unavailable', () => {
      const originalPerformance = (globalThis as Record<string, unknown>)
        .performance;
      (globalThis as Record<string, unknown>).performance = undefined;

      const beforeTime = Date.now();
      const { appStartTs } = require('../env');
      const afterTime = Date.now();

      // Should be a timestamp from Date.now()
      expect(appStartTs).toBeGreaterThanOrEqual(beforeTime);
      expect(appStartTs).toBeLessThanOrEqual(afterTime);

      (globalThis as Record<string, unknown>).performance = originalPerformance;
    });
  });
});
