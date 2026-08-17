import { Platform } from 'react-native';
import {
  errorLogService,
  serializeErrorData,
} from '../errorLogService';

jest.mock('expo-updates', () => ({
  updateId: 'test-update-id',
  channel: 'preview',
  runtimeVersion: '1.15',
}));

jest.mock('../telemetryService', () => ({
  reportErrorEvent: jest.fn(),
  reportMetric: jest.fn(),
}));

jest.mock('promise/setimmediate/rejection-tracking', () => ({
  enable: jest.fn(),
  disable: jest.fn(),
}));

describe('serializeErrorData', () => {
  it('serializes Error objects with stack and name', () => {
    const error = new Error('manga failed');
    error.name = 'MangaNetworkError';

    expect(serializeErrorData(error)).toMatchObject({
      name: 'MangaNetworkError',
      message: 'manga failed',
    });
  });

  it('serializes axios-like errors nested in data', () => {
    const error = new Error('Request failed with status code 403');
    (error as Error & { response?: { status: number }; code?: string }).response =
    { status: 403 };
    (error as Error & { code?: string }).code = 'ERR_BAD_REQUEST';
    (error as Error & { config?: { url: string } }).config = {
      url: 'https://mangafire.to/api/titles/1',
    };

    const serialized = serializeErrorData({ mangaId: 'solo-leveling', error });
    expect(serialized).toMatchObject({
      mangaId: 'solo-leveling',
      error: {
        message: 'Request failed with status code 403',
        status: 403,
        code: 'ERR_BAD_REQUEST',
        url: 'https://mangafire.to/api/titles/1',
      },
    });
  });
});

describe('errorLogService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    errorLogService.resetForTests();
    await errorLogService.clear();
  });

  it('persists logger errors to a readable file', async () => {
    errorLogService.recordFromLogger(
      'error',
      'Service',
      'Failed to load manga details',
      { mangaId: 'ro8ro', error: new Error('Timed out waiting for MangaFire protection module') }
    );

    const entries = await errorLogService.getEntries();
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      level: 'error',
      source: 'logger',
      scope: 'Service',
      message: 'Failed to load manga details',
      platform: Platform.OS,
    });
    expect(entries[0]?.data).toMatchObject({
      mangaId: 'ro8ro',
      error: {
        message: 'Timed out waiting for MangaFire protection module',
      },
    });

    const { reportErrorEvent } = require('../telemetryService') as {
      reportErrorEvent: jest.Mock;
    };
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app.error',
        message: 'Failed to load manga details',
        scope: 'Service',
      })
    );
    expect(reportErrorEvent.mock.calls[0][0].data).toBeUndefined();
  });

  it('flushes pending writes before returning a shareable file URI', async () => {
    errorLogService.recordFromLogger(
      'error',
      'Service',
      'Failed to load home manga data',
      { offline: false }
    );

    const fileUri = await errorLogService.getPersistedFileUri();
    expect(fileUri).toContain('error-log.json');

    const text = await errorLogService.getText();
    expect(text).toContain('Failed to load home manga data');
  });

  it('returns a text dump and summary for the debug menu', async () => {
    errorLogService.recordFromLogger(
      'error',
      'Network',
      'Failed to acquire MangaFire VRF token',
      { path: '/titles/ro8ro' }
    );

    const [summary, text] = await Promise.all([
      errorLogService.getSummary(),
      errorLogService.getText(),
    ]);

    expect(summary.count).toBe(1);
    expect(summary.last?.message).toBe('Failed to acquire MangaFire VRF token');
    expect(summary.fileUri).toContain('error-log.json');
    expect(text).toContain('Failed to acquire MangaFire VRF token');
    expect(text).toContain('/titles/ro8ro');
  });

  it('clears the saved file', async () => {
    errorLogService.recordFromLogger('error', 'UI', 'boom');
    await errorLogService.getEntries();

    await errorLogService.clear();

    const entries = await errorLogService.getEntries();
    expect(entries).toHaveLength(0);
    expect(await errorLogService.getText()).toBe('No errors recorded.');
  });

  it('surfaces disk write failures when flushing a shareable file', async () => {
    const { File } = require('expo-file-system') as {
      File: { prototype: { write: (...args: unknown[]) => Promise<void> } };
    };
    const writeSpy = jest
      .spyOn(File.prototype, 'write')
      .mockRejectedValue(new Error('ENOSPC'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

    try {
      errorLogService.recordFromLogger('error', 'Service', 'boom');
      await expect(errorLogService.getEntries()).resolves.toHaveLength(1);
      await expect(errorLogService.getPersistedFileUri()).rejects.toThrow(
        'ENOSPC'
      );
    } finally {
      writeSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('keeps accepting writes after a persist failure', async () => {
    const { File } = require('expo-file-system') as {
      File: { prototype: { write: (...args: unknown[]) => Promise<void> } };
    };
    const writeSpy = jest.spyOn(File.prototype, 'write');
    writeSpy.mockRejectedValueOnce(new Error('ENOSPC'));
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => { });

    try {
      errorLogService.recordFromLogger('error', 'Service', 'first');
      await expect(errorLogService.getEntries()).resolves.toHaveLength(1);

      errorLogService.recordFromLogger('error', 'Service', 'second');
      const entries = await errorLogService.getEntries();
      expect(entries.map((entry) => entry.message)).toEqual([
        'first',
        'second',
      ]);
    } finally {
      writeSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it('records uncaught exceptions with source metadata', async () => {
    errorLogService.recordException(new Error('WebView crashed'), {
      source: 'global',
      fatal: true,
    });

    const entries = await errorLogService.getEntries();
    expect(entries[0]).toMatchObject({
      source: 'global',
      message: 'WebView crashed',
      data: { fatal: true },
    });
  });

  it('installs a global error handler that records fatals', async () => {
    const previousHandler = jest.fn();
    const errorUtils = {
      getGlobalHandler: jest.fn(() => previousHandler),
      setGlobalHandler: jest.fn(),
    };
    (globalThis as { ErrorUtils?: typeof errorUtils }).ErrorUtils = errorUtils;

    errorLogService.resetForTests();
    errorLogService.installGlobalHandlers();

    expect(errorUtils.setGlobalHandler).toHaveBeenCalledTimes(1);
    const handler = errorUtils.setGlobalHandler.mock.calls[0]?.[0];
    expect(handler).toBeInstanceOf(Function);

    handler?.(new Error('native fatal'), true);
    const entries = await errorLogService.getEntries();
    expect(entries[0]?.source).toBe('global');
    expect(previousHandler).toHaveBeenCalled();

    const { reportErrorEvent } = require('../telemetryService') as {
      reportErrorEvent: jest.Mock;
    };
    expect(reportErrorEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'app.exception',
        level: 'fatal',
        message: 'native fatal',
        source: 'global',
      })
    );
  });

  it('installs Hermes rejection tracking even when addEventListener exists', async () => {
    const tracking = require('promise/setimmediate/rejection-tracking') as {
      enable: jest.Mock;
    };
    const enablePromiseRejectionTracker = jest.fn();
    const addEventListener = jest.fn();
    const globalAny = globalThis as typeof globalThis & {
      HermesInternal?: {
        enablePromiseRejectionTracker: typeof enablePromiseRejectionTracker;
      };
      addEventListener?: typeof addEventListener;
    };
    const previousHermes = globalAny.HermesInternal;
    const previousAddEventListener = globalAny.addEventListener;

    globalAny.HermesInternal = {
      enablePromiseRejectionTracker,
    };
    globalAny.addEventListener = addEventListener;

    try {
      errorLogService.resetForTests();
      errorLogService.installGlobalHandlers();

      expect(enablePromiseRejectionTracker).toHaveBeenCalledWith(
        expect.objectContaining({
          allRejections: true,
          onUnhandled: expect.any(Function),
        })
      );
      expect(addEventListener).not.toHaveBeenCalled();
      expect(tracking.enable).not.toHaveBeenCalled();

      const onUnhandled =
        enablePromiseRejectionTracker.mock.calls[0]?.[0]?.onUnhandled;
      onUnhandled?.(1, new Error('Hermes unhandled rejection'));

      const entries = await errorLogService.getEntries();
      expect(entries[0]).toMatchObject({
        source: 'unhandledrejection',
        message: 'Hermes unhandled rejection',
      });
    } finally {
      if (previousHermes === undefined) {
        delete globalAny.HermesInternal;
      } else {
        globalAny.HermesInternal = previousHermes;
      }
      if (previousAddEventListener === undefined) {
        delete globalAny.addEventListener;
      } else {
        globalAny.addEventListener = previousAddEventListener;
      }
    }
  });

  it('installs promise rejection-tracking when Hermes is unavailable', () => {
    const tracking = require('promise/setimmediate/rejection-tracking') as {
      enable: jest.Mock;
    };
    const globalAny = globalThis as typeof globalThis & {
      HermesInternal?: unknown;
    };
    const previousHermes = globalAny.HermesInternal;
    delete globalAny.HermesInternal;

    try {
      errorLogService.resetForTests();
      errorLogService.installGlobalHandlers();

      expect(tracking.enable).toHaveBeenCalledWith(
        expect.objectContaining({
          allRejections: true,
          onUnhandled: expect.any(Function),
        })
      );
    } finally {
      if (previousHermes === undefined) {
        delete globalAny.HermesInternal;
      } else {
        globalAny.HermesInternal = previousHermes;
      }
    }
  });
});
