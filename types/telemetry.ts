export type TelemetryKind = 'error' | 'metric';

export interface TelemetryRuntime {
  platform: string;
  platformVersion: string;
  model?: string;
  appVersion?: string;
  build?: string;
  sdkVersion?: string;
  variant?: string;
  channel?: string;
  updateId?: string;
  runtimeVersion?: string;
  updateCreatedAt?: string;
  launch?: string;
  executionEnv?: string;
  jsEngine?: string;
}

export interface TelemetryEvent extends Partial<TelemetryRuntime> {
  kind: TelemetryKind;
  name: string;
  level?: string;
  message?: string;
  stack?: string;
  scope?: string;
  source?: string;
  route?: string;
  durationMs?: number;
}
