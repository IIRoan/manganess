import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { requireOptionalNativeModule } from 'expo-modules-core';
import {
  reportErrorEvent,
  reportMetric,
  reportWait,
  resetTelemetryForTests,
} from '../telemetryService';

jest.mock('@/constants/telemetry', () => ({
  isTelemetryEnabled: () => true,
  getTelemetryUrl: () => 'https://telemetry.example',
  getTelemetryProject: () => 'manganess',
}));

const INSTALL_TOKEN = 'a'.repeat(64);

async function waitForCalls(count: number): Promise<void> {
  for (let i = 0; i < 50; i += 1) {
    if ((global.fetch as jest.Mock).mock.calls.length >= count) {
      return;
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error(
    `expected ${count} fetch calls, got ${(global.fetch as jest.Mock).mock.calls.length}`
  );
}

describe('telemetryService', () => {
  beforeEach(async () => {
    resetTelemetryForTests();
    (requireOptionalNativeModule as jest.Mock).mockReturnValue(null);
    (SecureStore.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (SecureStore.setItemAsync as jest.Mock).mockClear();
    await SecureStore.deleteItemAsync('manganess.telemetry.installToken');
    global.fetch = jest.fn(async (url: string) => {
      if (String(url).endsWith('/v1/register')) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ token: INSTALL_TOKEN }),
        };
      }
      return { ok: true, status: 204, json: async () => ({}) };
    }) as jest.Mock;
  });

  afterEach(() => {
    (requireOptionalNativeModule as jest.Mock).mockReturnValue(null);
  });

  it('registers an install token, stores it securely, then posts errors', async () => {
    (requireOptionalNativeModule as jest.Mock).mockReturnValue({});
    resetTelemetryForTests();
    reportErrorEvent({
      name: 'app.error',
      level: 'error',
      message: 'Failed to load manga details',
      scope: 'Service',
    });

    await waitForCalls(2);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://telemetry.example/v1/register',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project: 'manganess' }),
      }
    );
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(
      'manganess.telemetry.installToken',
      INSTALL_TOKEN,
      expect.anything()
    );
    expect(global.fetch).toHaveBeenCalledWith(
      'https://telemetry.example/v1/events',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${INSTALL_TOKEN}`,
        }),
      })
    );
    const eventCall = (global.fetch as jest.Mock).mock.calls.find((call) =>
      String(call[0]).endsWith('/v1/events')
    );
    const body = JSON.parse(eventCall?.[1].body as string);
    expect(body).toMatchObject({
      kind: 'error',
      name: 'app.error',
      message: 'Failed to load manga details',
      platform: Platform.OS,
    });
    expect(body).not.toHaveProperty('mangaId');
  });

  it('still reports when SecureStore is unavailable', async () => {
    (requireOptionalNativeModule as jest.Mock).mockReturnValue(null);
    resetTelemetryForTests();
    reportErrorEvent({
      name: 'app.error',
      message: 'still reports without keychain',
    });
    await waitForCalls(2);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledWith(
      'https://telemetry.example/v1/events',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${INSTALL_TOKEN}`,
        }),
      })
    );
  });

  it('posts metrics with the stored install token', async () => {
    (requireOptionalNativeModule as jest.Mock).mockReturnValue({});
    resetTelemetryForTests();
    await SecureStore.setItemAsync(
      'manganess.telemetry.installToken',
      INSTALL_TOKEN
    );
    reportMetric({ name: 'tti', durationMs: 800, route: '/' });
    await waitForCalls(1);
    const eventCall = (global.fetch as jest.Mock).mock.calls.find((call) =>
      String(call[0]).endsWith('/v1/events')
    );
    const body = JSON.parse(eventCall?.[1].body as string);
    expect(body).toMatchObject({
      kind: 'metric',
      name: 'tti',
      durationMs: 800,
      route: '/',
    });
  });

  it('posts sanitized wait phases without raw manga ids', async () => {
    (requireOptionalNativeModule as jest.Mock).mockReturnValue({});
    resetTelemetryForTests();
    await SecureStore.setItemAsync(
      'manganess.telemetry.installToken',
      INSTALL_TOKEN
    );
    reportWait('vrf_module', 1250.4);
    reportWait('chapter_pages', 4100, '/manga/ro8ro/chapter/12');
    await waitForCalls(2);
    const eventBodies = (global.fetch as jest.Mock).mock.calls
      .filter((call) => String(call[0]).endsWith('/v1/events'))
      .map((call) => JSON.parse(call[1].body as string));
    expect(eventBodies).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'metric',
          name: 'wait.vrf_module',
          durationMs: 1250,
        }),
        expect.objectContaining({
          kind: 'metric',
          name: 'wait.chapter_pages',
          durationMs: 4100,
          route: '/manga/[id]/chapter/[n]',
        }),
      ])
    );
    expect(JSON.stringify(eventBodies)).not.toContain('ro8ro');
  });
});
