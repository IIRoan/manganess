import { appStartTs, isDebugEnabled } from '@/constants/env';
import type { LogEntry, LogLevel, LogScope, Logger } from '@/types';

const MAX_BUFFER = 500;

class DebugLogger implements Logger {
  private buffer: LogEntry[] = [];
  private timers = new Map<string, number>();
  private enabled = isDebugEnabled();

  private push(entry: LogEntry) {
    this.buffer.push(entry);
    if (this.buffer.length > MAX_BUFFER) this.buffer.shift();
  }

  private formatPrefix(sinceStartMs: number, scope: LogScope, level: LogLevel) {
    const ms = Math.round(sinceStartMs);
    return `[+${ms}ms][${scope}][${level}]`;
  }

  private log(
    level: LogLevel,
    scope: LogScope,
    msg: string,
    data?: unknown,
    durationMs?: number
  ) {
    if (!this.enabled) return;
    const ts = Date.now();
    const now = (globalThis as any).performance?.now?.() ?? ts;
    const sinceStartMs = now - appStartTs;

    const entry: LogEntry = {
      ts,
      sinceStartMs,
      level,
      scope,
      msg,
      ...(typeof data !== 'undefined' ? { data } : {}),
      ...(typeof durationMs !== 'undefined' ? { durationMs } : {}),
    };
    this.push(entry);

    const prefix = this.formatPrefix(sinceStartMs, scope, level);
    if (typeof data !== 'undefined') {
      // eslint-disable-next-line no-console
      (console as any)[level === 'debug' ? 'log' : level](
        `${prefix} ${msg}${durationMs != null ? ` (${Math.round(durationMs)}ms)` : ''}`,
        data
      );
    } else {
      // eslint-disable-next-line no-console
      (console as any)[level === 'debug' ? 'log' : level](
        `${prefix} ${msg}${durationMs != null ? ` (${Math.round(durationMs)}ms)` : ''}`
      );
    }
  }

  debug(scope: LogScope, msg: string, data?: unknown) {
    this.log('debug', scope, msg, data);
  }
  info(scope: LogScope, msg: string, data?: unknown) {
    this.log('info', scope, msg, data);
  }
  warn(scope: LogScope, msg: string, data?: unknown) {
    this.log('warn', scope, msg, data);
  }
  error(scope: LogScope, msg: string, data?: unknown) {
    this.log('error', scope, msg, data);
  }

  time(key: string, scope: LogScope = 'UI') {
    if (!this.enabled) return;
    this.timers.set(
      key,
      (globalThis as any).performance?.now?.() ?? Date.now()
    );
    this.debug(scope, `⏱️ start: ${key}`);
  }

  timeEnd(
    key: string,
    scope: LogScope = 'UI',
    msg?: string,
    data?: unknown
  ): number | undefined {
    if (!this.enabled) return;
    const start = this.timers.get(key);
    if (start == null) return;
    this.timers.delete(key);
    const end = (globalThis as any).performance?.now?.() ?? Date.now();
    const durationMs = end - start;
    this.log('info', scope, msg ?? `⏱️ ${key}`, data, durationMs);
    return durationMs;
  }

  async measureAsync<T>(
    name: string,
    scope: LogScope,
    fn: () => Promise<T>,
    data?: () => unknown
  ): Promise<T> {
    if (!this.enabled) return fn();
    const start = (globalThis as any).performance?.now?.() ?? Date.now();
    this.debug(scope, `⏱️ start: ${name}`);
    try {
      const res = await fn();
      const end = (globalThis as any).performance?.now?.() ?? Date.now();
      this.log('info', scope, `⏱️ ${name}`, data?.(), end - start);
      return res;
    } catch (err) {
      const end = (globalThis as any).performance?.now?.() ?? Date.now();
      this.log(
        'error',
        scope,
        `⏱️ ${name} failed`,
        { error: String(err) },
        end - start
      );
      throw err;
    }
  }

  getEntries(): ReadonlyArray<LogEntry> {
    return this.buffer;
  }
  clear(): void {
    this.buffer = [];
  }
}

let instance: Logger | null = null;
export function logger(): Logger {
  if (!instance) instance = new DebugLogger();
  return instance;
}
