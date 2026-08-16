import { Platform } from 'react-native';
import {
  File as FSFile,
  Directory as FSDirectory,
  Paths,
} from 'expo-file-system';
import Constants from 'expo-constants';
import type {
  ErrorLogFile,
  ErrorLogLevel,
  ErrorLogRuntimeContext,
  ErrorLogSource,
  ErrorLogSummary,
  PersistedErrorEntry,
} from '@/types/errorLog';
import type { LogScope } from '@/types/logging';

const LOG_DIR = new FSDirectory(Paths.document, 'debug');
const LOG_FILE = new FSFile(LOG_DIR, 'error-log.json');
const MAX_ENTRIES = 200;
const MAX_SERIALIZED_CHARS = 4000;
const FILE_VERSION = 1 as const;

type RNErrorUtils = {
  getGlobalHandler?: () =>
    | ((error: Error, isFatal?: boolean) => void)
    | undefined;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

function truncate(value: string, max = MAX_SERIALIZED_CHARS): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max)}…[truncated]`;
}

function safeJson(value: unknown): unknown {
  try {
    JSON.stringify(value);
    return value;
  } catch {
    return String(value);
  }
}

export function serializeErrorData(value: unknown): unknown {
  if (value == null) {
    return value;
  }

  if (value instanceof Error) {
    const axiosLike = value as Error & {
      code?: string;
      response?: { status?: number; data?: unknown };
      config?: { url?: string; method?: string };
    };
    const responseData = axiosLike.response?.data;
    return {
      name: value.name,
      message: value.message,
      stack: value.stack ? truncate(value.stack) : undefined,
      code: axiosLike.code,
      status: axiosLike.response?.status,
      url: axiosLike.config?.url,
      method: axiosLike.config?.method,
      responseData:
        typeof responseData === 'string'
          ? truncate(responseData, 1500)
          : safeJson(responseData),
    };
  }

  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => serializeErrorData(item));
  }

  if (typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = serializeErrorData(nested);
    }
    return output;
  }

  if (typeof value === 'string') {
    return truncate(value);
  }

  return value;
}

function getRuntimeContext(): ErrorLogRuntimeContext {
  const context: ErrorLogRuntimeContext = {
    platform: Platform.OS,
    platformVersion: String(Platform.Version),
  };

  try {
    const appVersion = Constants.expoConfig?.version;
    if (appVersion) {
      context.appVersion = appVersion;
    }
  } catch {
    // Constants can be unavailable in some test environments
  }

  try {
    // Lazy require so tests that don't mock expo-updates still work
    const Updates = require('expo-updates') as {
      updateId?: string | null;
      channel?: string | null;
      runtimeVersion?: string | null;
    };
    if (Updates.updateId) {
      context.updateId = Updates.updateId;
    }
    if (Updates.channel) {
      context.channel = Updates.channel;
    }
    if (Updates.runtimeVersion) {
      context.runtimeVersion = Updates.runtimeVersion;
    }
  } catch {
    // expo-updates is optional at persist time
  }

  return context;
}

function createId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatEntry(entry: PersistedErrorEntry): string {
  const lines = [
    `[${entry.iso}] ${entry.level.toUpperCase()} (${entry.source}${entry.scope ? `/${entry.scope}` : ''})`,
    entry.message,
  ];
  if (entry.stack) {
    lines.push(entry.stack);
  }
  if (typeof entry.data !== 'undefined') {
    try {
      lines.push(JSON.stringify(entry.data, null, 2));
    } catch {
      lines.push(String(entry.data));
    }
  }
  lines.push(
    `platform=${entry.platform} ${entry.platformVersion} app=${entry.appVersion ?? 'unknown'} channel=${entry.channel ?? 'none'} updateId=${entry.updateId ?? 'none'}`
  );
  return lines.join('\n');
}

class ErrorLogService {
  private writeChain: Promise<void> = Promise.resolve();
  private cache: PersistedErrorEntry[] | null = null;
  private handlersInstalled = false;

  getFileUri(): string {
    return LOG_FILE.uri;
  }

  /**
   * Wait for queued error writes, then return the on-disk file URI.
   * Use this before sharing/exporting so the file is not empty or stale.
   */
  async getPersistedFileUri(): Promise<string> {
    await this.enqueue(async () => {
      if (!this.cache) {
        await this.loadEntries();
      }
      await this.writeFile(this.cache ?? []);
    });
    return LOG_FILE.uri;
  }

  recordFromLogger(
    level: ErrorLogLevel,
    scope: LogScope,
    message: string,
    data?: unknown
  ): void {
    const serialized = serializeErrorData(data);
    const nestedError =
      data instanceof Error
        ? data
        : data &&
          typeof data === 'object' &&
          'error' in data &&
          (data as { error?: unknown }).error instanceof Error
          ? (data as { error: Error }).error
          : undefined;
    const stack = nestedError?.stack;

    void this.append({
      level,
      source: 'logger',
      scope,
      message,
      ...(typeof serialized !== 'undefined' ? { data: serialized } : {}),
      ...(stack ? { stack } : {}),
    });
  }

  recordException(
    error: unknown,
    options: {
      source: ErrorLogSource;
      message?: string;
      data?: unknown;
      fatal?: boolean;
    }
  ): void {
    const serialized = serializeErrorData(error);
    const message =
      options.message ||
      (error instanceof Error ? error.message : String(error));
    const stack = error instanceof Error ? error.stack : undefined;

    void this.append({
      level: 'error',
      source: options.source,
      message,
      data: {
        fatal: options.fatal ?? false,
        error: serialized,
        ...(options.data ? { extra: serializeErrorData(options.data) } : {}),
      },
      ...(stack ? { stack } : {}),
    });
  }

  installGlobalHandlers(): void {
    if (this.handlersInstalled) {
      return;
    }
    this.handlersInstalled = true;

    const globalWithErrorUtils = globalThis as typeof globalThis & {
      ErrorUtils?: RNErrorUtils;
    };
    const errorUtils = globalWithErrorUtils.ErrorUtils;
    if (errorUtils?.setGlobalHandler) {
      const previousHandler = errorUtils.getGlobalHandler?.();
      errorUtils.setGlobalHandler((error, isFatal) => {
        this.recordException(error, {
          source: 'global',
          fatal: Boolean(isFatal),
        });
        previousHandler?.(error, isFatal);
      });
    }

    this.installUnhandledRejectionTracking((reason) => {
      this.recordException(reason, {
        source: 'unhandledrejection',
        message:
          reason instanceof Error
            ? reason.message
            : `Unhandled promise rejection: ${String(reason)}`,
      });
    });
  }

  /**
   * Hermes native Promise does not dispatch DOM `unhandledrejection` events.
   * Prefer the VM tracker, then the `promise` polyfill, then DOM fallbacks.
   * Never return early just because `addEventListener` exists.
   */
  private installUnhandledRejectionTracking(
    handleRejection: (reason: unknown) => void
  ): void {
    type RejectionEvent = {
      reason?: unknown;
      preventDefault?: () => void;
    };
    type RejectionTracking = {
      enable: (options: {
        allRejections: boolean;
        onUnhandled: (id: number, rejection: unknown) => void;
        onHandled: (id: number) => void;
      }) => void;
    };

    const globalAny = globalThis as typeof globalThis & {
      HermesInternal?: {
        hasPromise?: () => boolean;
        enablePromiseRejectionTracker?: (options: {
          allRejections: boolean;
          onUnhandled: (id: number, rejection: unknown) => void;
          onHandled?: (id: number) => void;
        }) => void;
      };
      addEventListener?: (
        type: string,
        listener: (event: RejectionEvent) => void
      ) => void;
      onunhandledrejection?: (event: RejectionEvent) => void;
    };

    const enableHermesTracker =
      globalAny.HermesInternal?.enablePromiseRejectionTracker;
    if (typeof enableHermesTracker === 'function') {
      enableHermesTracker({
        allRejections: true,
        onUnhandled: (_id, rejection) => {
          handleRejection(rejection);
        },
        onHandled: () => { },
      });
      return;
    }

    try {
      // RN JSC / polyfilled Promise. Hermes native Promise ignores this.
      const tracking = require('promise/setimmediate/rejection-tracking') as RejectionTracking;
      tracking.enable({
        allRejections: true,
        onUnhandled: (_id, rejection) => {
          handleRejection(rejection);
        },
        onHandled: () => { },
      });
      return;
    } catch {
      // Host without the promise polyfill; fall through to DOM-style hooks.
    }

    if (typeof globalAny.addEventListener === 'function') {
      globalAny.addEventListener('unhandledrejection', (event) => {
        handleRejection(event.reason);
      });
    }

    const previousRejectionHandler = globalAny.onunhandledrejection;
    globalAny.onunhandledrejection = (event) => {
      handleRejection(event?.reason);
      previousRejectionHandler?.(event);
    };
  }

  async getEntries(): Promise<PersistedErrorEntry[]> {
    await this.writeChain;
    return this.loadEntries();
  }

  async getSummary(): Promise<ErrorLogSummary> {
    await this.writeChain;
    const entries = await this.loadEntries();
    return {
      count: entries.length,
      last: entries[entries.length - 1] ?? null,
      fileUri: this.getFileUri(),
    };
  }

  async getText(): Promise<string> {
    await this.writeChain;
    const entries = await this.loadEntries();
    if (!entries.length) {
      return 'No errors recorded.';
    }
    return entries.map(formatEntry).join('\n\n---\n\n');
  }

  async clear(): Promise<void> {
    await this.enqueue(async () => {
      this.cache = [];
      await this.writeFile([]);
    });
  }

  resetForTests(): void {
    this.cache = null;
    this.handlersInstalled = false;
    this.writeChain = Promise.resolve();
  }

  private append(
    partial: Omit<
      PersistedErrorEntry,
      | 'id'
      | 'ts'
      | 'iso'
      | 'platform'
      | 'platformVersion'
      | 'appVersion'
      | 'updateId'
      | 'channel'
      | 'runtimeVersion'
    >
  ): Promise<void> {
    return this.enqueue(async () => {
      const runtime = getRuntimeContext();
      const entry: PersistedErrorEntry = {
        id: createId(),
        ts: Date.now(),
        iso: new Date().toISOString(),
        ...runtime,
        ...partial,
        ...(partial.stack ? { stack: truncate(partial.stack) } : {}),
      };

      const entries = await this.loadEntries();
      entries.push(entry);
      const trimmed =
        entries.length > MAX_ENTRIES
          ? entries.slice(entries.length - MAX_ENTRIES)
          : entries;
      this.cache = trimmed;
      await this.writeFile(trimmed);
    });
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.writeChain.then(task, task);
    this.writeChain = run.then(
      () => undefined,
      () => undefined
    );
    return run.catch(() => undefined);
  }

  private async loadEntries(): Promise<PersistedErrorEntry[]> {
    if (this.cache) {
      return [...this.cache];
    }

    try {
      await this.ensureFile();
      const raw = await this.readText();
      if (!raw.trim()) {
        this.cache = [];
        return [];
      }

      const parsed = JSON.parse(raw) as ErrorLogFile | PersistedErrorEntry[];
      const entries = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.entries)
          ? parsed.entries
          : [];
      this.cache = entries;
      return [...entries];
    } catch {
      this.cache = [];
      return [];
    }
  }

  private async ensureFile(): Promise<void> {
    try {
      if (!LOG_DIR.exists) {
        await LOG_DIR.create();
      }
    } catch {
      // Directory may already exist
    }

    try {
      if (!LOG_FILE.exists) {
        const create = (
          LOG_FILE as FSFile & { create?: () => void | Promise<void> }
        ).create;
        if (typeof create === 'function') {
          await create.call(LOG_FILE);
        }
      }
    } catch {
      // File create is best-effort; write() will create it on some platforms
    }
  }

  private async readText(): Promise<string> {
    const file = LOG_FILE as FSFile & {
      text?: () => Promise<string> | string;
      read?: () => Promise<string> | string;
    };
    if (typeof file.text === 'function') {
      return String((await file.text()) ?? '');
    }
    if (typeof file.read === 'function') {
      return String((await file.read()) ?? '');
    }
    return '';
  }

  private async writeFile(entries: PersistedErrorEntry[]): Promise<void> {
    await this.ensureFile();
    const payload: ErrorLogFile = {
      version: FILE_VERSION,
      entries,
    };
    const contents = JSON.stringify(payload, null, 2);
    await LOG_FILE.write(contents, { encoding: 'utf8' });
  }
}

export const errorLogService = new ErrorLogService();
