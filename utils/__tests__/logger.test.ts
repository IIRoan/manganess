// Mock the env module before importing logger
jest.mock('@/constants/env', () => ({
  appStartTs: 0,
  isDebugEnabled: jest.fn(() => true),
}));

import { logger } from '../logger';

describe('logger', () => {
  let consoleSpy: {
    log: jest.SpyInstance;
    info: jest.SpyInstance;
    warn: jest.SpyInstance;
    error: jest.SpyInstance;
  };

  beforeEach(() => {
    jest.clearAllMocks();

    consoleSpy = {
      log: jest.spyOn(console, 'log').mockImplementation(),
      info: jest.spyOn(console, 'info').mockImplementation(),
      warn: jest.spyOn(console, 'warn').mockImplementation(),
      error: jest.spyOn(console, 'error').mockImplementation(),
    };
  });

  afterEach(() => {
    consoleSpy.log.mockRestore();
    consoleSpy.info.mockRestore();
    consoleSpy.warn.mockRestore();
    consoleSpy.error.mockRestore();
  });

  describe('singleton pattern', () => {
    it('returns the same instance on multiple calls', () => {
      const log1 = logger();
      const log2 = logger();
      expect(log1).toBe(log2);
    });
  });

  describe('log methods', () => {
    it('logs debug messages', () => {
      const log = logger();
      log.debug('UI', 'Test debug message');

      expect(consoleSpy.log).toHaveBeenCalled();
      const call = consoleSpy.log.mock.calls[0][0];
      expect(call).toContain('[UI]');
      expect(call).toContain('[debug]');
      expect(call).toContain('Test debug message');
    });

    it('logs info messages', () => {
      const log = logger();
      log.info('Network', 'Test info message');

      expect(consoleSpy.info).toHaveBeenCalled();
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain('[Network]');
      expect(call).toContain('[info]');
      expect(call).toContain('Test info message');
    });

    it('logs warn messages', () => {
      const log = logger();
      log.warn('Storage', 'Test warn message');

      expect(consoleSpy.warn).toHaveBeenCalled();
      const call = consoleSpy.warn.mock.calls[0][0];
      expect(call).toContain('[Storage]');
      expect(call).toContain('[warn]');
      expect(call).toContain('Test warn message');
    });

    it('logs error messages', () => {
      const log = logger();
      log.error('Service', 'Test error message');

      expect(consoleSpy.error).toHaveBeenCalled();
      const call = consoleSpy.error.mock.calls[0][0];
      expect(call).toContain('[Service]');
      expect(call).toContain('[error]');
      expect(call).toContain('Test error message');
    });

    it('logs messages with additional data', () => {
      const log = logger();
      const data = { key: 'value', count: 42 };
      log.info('UI', 'Message with data', data);

      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.any(String),
        data
      );
    });
  });

  describe('timing functions', () => {
    it('tracks time with time/timeEnd', () => {
      const log = logger();

      log.time('testOperation', 'UI');
      const duration = log.timeEnd('testOperation', 'UI');

      expect(duration).toBeGreaterThanOrEqual(0);
      expect(consoleSpy.log).toHaveBeenCalled(); // debug log for start
      expect(consoleSpy.info).toHaveBeenCalled(); // info log for end
    });

    it('timeEnd returns undefined for unknown key', () => {
      const log = logger();

      const duration = log.timeEnd('unknownKey', 'UI');

      expect(duration).toBeUndefined();
    });

    it('timeEnd includes custom message', () => {
      const log = logger();

      log.time('op', 'Service');
      log.timeEnd('op', 'Service', 'Custom completion message');

      expect(consoleSpy.info).toHaveBeenCalled();
      const call = consoleSpy.info.mock.calls[0][0];
      expect(call).toContain('Custom completion message');
    });
  });

  describe('measureAsync', () => {
    it('measures async function duration', async () => {
      const log = logger();

      const result = await log.measureAsync(
        'asyncOp',
        'Service',
        async () => 'success'
      );

      expect(result).toBe('success');
      expect(consoleSpy.log).toHaveBeenCalled(); // debug start
      expect(consoleSpy.info).toHaveBeenCalled(); // info end
    });

    it('logs error on async function failure', async () => {
      const log = logger();
      const testError = new Error('Test failure');

      await expect(
        log.measureAsync('failingOp', 'Service', async () => {
          throw testError;
        })
      ).rejects.toThrow('Test failure');

      expect(consoleSpy.error).toHaveBeenCalled();
      const call = consoleSpy.error.mock.calls[0][0];
      expect(call).toContain('failingOp failed');
    });

    it('includes data callback in log', async () => {
      const log = logger();
      const dataFn = jest.fn(() => ({ extra: 'info' }));

      await log.measureAsync(
        'opWithData',
        'Service',
        async () => 'result',
        dataFn
      );

      expect(dataFn).toHaveBeenCalled();
      expect(consoleSpy.info).toHaveBeenCalledWith(
        expect.any(String),
        { extra: 'info' }
      );
    });
  });

  describe('buffer management', () => {
    it('stores log entries in buffer', () => {
      const log = logger();
      log.clear();

      log.info('UI', 'Entry 1');
      log.info('UI', 'Entry 2');
      log.warn('UI', 'Entry 3');

      const entries = log.getEntries();
      expect(entries.length).toBe(3);
    });

    it('clears buffer', () => {
      const log = logger();

      log.info('UI', 'Some entry');
      expect(log.getEntries().length).toBeGreaterThan(0);

      log.clear();
      expect(log.getEntries().length).toBe(0);
    });

    it('entries contain expected properties', () => {
      const log = logger();
      log.clear();

      log.info('Network', 'Test message', { key: 'value' });

      const entries = log.getEntries();
      const [firstEntry] = entries;
      expect(firstEntry).toBeDefined();
      expect(firstEntry).toMatchObject({
        level: 'info',
        scope: 'Network',
        msg: 'Test message',
        data: { key: 'value' },
      });
      expect(firstEntry?.ts).toBeDefined();
      expect(firstEntry?.sinceStartMs).toBeDefined();
    });

    it('limits buffer to MAX_BUFFER size', () => {
      const log = logger();
      log.clear();

      // Log more than MAX_BUFFER (500) entries
      for (let i = 0; i < 550; i++) {
        log.info('UI', `Entry ${i}`);
      }

      const entries = log.getEntries();
      expect(entries.length).toBeLessThanOrEqual(500);
    });
  });
});
