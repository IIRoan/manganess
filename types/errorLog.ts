export type ErrorLogLevel = 'warn' | 'error';

export type ErrorLogSource =
  | 'logger'
  | 'react'
  | 'global'
  | 'unhandledrejection';

export interface ErrorLogRuntimeContext {
  platform: string;
  platformVersion: string;
  model?: string;
  appVersion?: string;
  build?: string;
  sdkVersion?: string;
  variant?: string;
  updateId?: string;
  channel?: string;
  runtimeVersion?: string;
  updateCreatedAt?: string;
  launch?: string;
  executionEnv?: string;
  jsEngine?: string;
}

export interface PersistedErrorEntry extends ErrorLogRuntimeContext {
  id: string;
  ts: number;
  iso: string;
  level: ErrorLogLevel;
  source: ErrorLogSource;
  scope?: string;
  message: string;
  data?: unknown;
  stack?: string;
}

export interface ErrorLogFile {
  version: 1;
  entries: PersistedErrorEntry[];
}

export interface ErrorLogSummary {
  count: number;
  last: PersistedErrorEntry | null;
  fileUri: string;
}
