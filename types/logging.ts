// Centralized logging types - single source of truth

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogScope = 'Navigation' | 'Network' | 'Service' | 'Storage' | 'UI';

export interface LogEntry {
  ts: number; // epoch milliseconds
  sinceStartMs: number; // milliseconds since app start
  level: LogLevel;
  scope: LogScope;
  msg: string;
  data?: unknown;
  durationMs?: number;
}

export interface Logger {
  debug(scope: LogScope, msg: string, data?: unknown): void;
  info(scope: LogScope, msg: string, data?: unknown): void;
  warn(scope: LogScope, msg: string, data?: unknown): void;
  error(scope: LogScope, msg: string, data?: unknown): void;

  time(key: string, scope?: LogScope): void;
  timeEnd(
    key: string,
    scope?: LogScope,
    msg?: string,
    data?: unknown
  ): number | undefined;

  measureAsync<T>(
    name: string,
    scope: LogScope,
    fn: () => Promise<T>,
    data?: () => unknown
  ): Promise<T>;

  getEntries(): ReadonlyArray<LogEntry>;
  clear(): void;
}
