import { Platform } from 'react-native';
import { collectTelemetryRuntime } from '../collectTelemetryRuntime';

jest.mock('expo-constants', () => ({
  nativeAppVersion: '1.16',
  nativeBuildVersion: '42',
  executionEnvironment: 'bare',
  expoConfig: {
    version: '1.16',
    sdkVersion: '57.0.0',
  },
}));

jest.mock('expo-updates', () => ({
  updateId: 'update-abc',
  channel: 'preview',
  runtimeVersion: '1.16.0',
  createdAt: new Date('2026-08-16T12:00:00.000Z'),
  isEmbeddedLaunch: false,
  isEmergencyLaunch: false,
}));

describe('collectTelemetryRuntime', () => {
  const originalVariant = process.env.APP_VARIANT;

  afterAll(() => {
    process.env.APP_VARIANT = originalVariant;
  });

  it('collects OS, app, and update debug fields', () => {
    process.env.APP_VARIANT = 'preview';
    const runtime = collectTelemetryRuntime();

    expect(runtime).toMatchObject({
      platform: Platform.OS,
      appVersion: '1.16',
      build: '42',
      sdkVersion: '57.0.0',
      variant: 'preview',
      channel: 'preview',
      updateId: 'update-abc',
      runtimeVersion: '1.16.0',
      updateCreatedAt: '2026-08-16T12:00:00.000Z',
      launch: 'ota',
      executionEnv: 'bare',
    });
    expect(runtime.platformVersion.length).toBeGreaterThan(0);
    expect(runtime.jsEngine).toMatch(/hermes|jsc/);
    expect(runtime).not.toHaveProperty('mangaId');
  });

  it('does not throw when Platform.constants is missing', () => {
    const originalConstants = Platform.constants;
    Object.defineProperty(Platform, 'constants', {
      configurable: true,
      value: undefined,
    });

    try {
      expect(() => collectTelemetryRuntime()).not.toThrow();
      const runtime = collectTelemetryRuntime();
      expect(runtime.platform).toBe(Platform.OS);
      expect(runtime.platformVersion.length).toBeGreaterThan(0);
    } finally {
      Object.defineProperty(Platform, 'constants', {
        configurable: true,
        value: originalConstants,
      });
    }
  });
});
