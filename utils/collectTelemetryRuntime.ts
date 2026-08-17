import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { TelemetryRuntime } from '@/types/telemetry';

function trim(value: unknown): string {
  if (value == null) {
    return '';
  }
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return '';
}

function put<K extends keyof TelemetryRuntime>(
  target: TelemetryRuntime,
  key: K,
  value: unknown
): void {
  const next = trim(value);
  if (!next) {
    return;
  }
  target[key] = next as TelemetryRuntime[K];
}

function osContext(): Pick<TelemetryRuntime, 'platformVersion' | 'model'> {
  if (Platform.OS === 'ios') {
    const constants = Platform.constants as {
      osVersion?: string;
      interfaceIdiom?: string;
    };
    const out: Pick<TelemetryRuntime, 'platformVersion' | 'model'> = {
      platformVersion: trim(constants.osVersion) || String(Platform.Version),
    };
    const model = trim(constants.interfaceIdiom);
    if (model) {
      out.model = model;
    }
    return out;
  }
  if (Platform.OS === 'android') {
    const constants = Platform.constants as {
      Brand?: string;
      Model?: string;
      Release?: string;
      Version?: number;
    };
    const api = trim(constants.Version ?? Platform.Version);
    const release = trim(constants.Release);
    const out: Pick<TelemetryRuntime, 'platformVersion' | 'model'> = {
      platformVersion: release
        ? `${release} (API ${api})`
        : api
          ? `API ${api}`
          : String(Platform.Version),
    };
    const model = [trim(constants.Brand), trim(constants.Model)]
      .filter(Boolean)
      .join(' ');
    if (model) {
      out.model = model;
    }
    return out;
  }
  return { platformVersion: String(Platform.Version) };
}

/**
 * Device/app debug context with no user identity, IPs, or manga ids.
 */
export function collectTelemetryRuntime(): TelemetryRuntime {
  const runtime: TelemetryRuntime = {
    platform: Platform.OS,
    ...osContext(),
  };

  try {
    put(
      runtime,
      'appVersion',
      Constants.expoConfig?.version ?? Constants.nativeAppVersion
    );
    put(runtime, 'build', Constants.nativeBuildVersion);
    put(runtime, 'sdkVersion', Constants.expoConfig?.sdkVersion);
    put(runtime, 'executionEnv', Constants.executionEnvironment);
  } catch {
    // Constants can be incomplete in tests.
  }

  put(runtime, 'variant', process.env.APP_VARIANT);
  put(
    runtime,
    'jsEngine',
    (globalThis as { HermesInternal?: unknown }).HermesInternal
      ? 'hermes'
      : 'jsc'
  );

  try {
    const Updates = require('expo-updates') as {
      updateId?: string | null;
      channel?: string | null;
      runtimeVersion?: string | null;
      createdAt?: Date | string | null;
      isEmbeddedLaunch?: boolean;
      isEmergencyLaunch?: boolean;
    };
    put(runtime, 'updateId', Updates.updateId);
    put(runtime, 'channel', Updates.channel);
    put(runtime, 'runtimeVersion', Updates.runtimeVersion);
    if (Updates.createdAt instanceof Date) {
      put(runtime, 'updateCreatedAt', Updates.createdAt.toISOString());
    } else {
      put(runtime, 'updateCreatedAt', Updates.createdAt);
    }
    if (Updates.isEmergencyLaunch) {
      put(runtime, 'launch', 'emergency');
    } else if (typeof Updates.isEmbeddedLaunch === 'boolean') {
      put(runtime, 'launch', Updates.isEmbeddedLaunch ? 'embedded' : 'ota');
    }
  } catch {
    // expo-updates is optional at collect time
  }

  return runtime;
}
