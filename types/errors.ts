// Error types for better error handling

export enum ErrorType {
  NETWORK = 'NETWORK',
  VALIDATION = 'VALIDATION',
  CACHE = 'CACHE',
  PARSING = 'PARSING',
  AUTHENTICATION = 'AUTHENTICATION',
  PERMISSION = 'PERMISSION',
  NOT_FOUND = 'NOT_FOUND',
  RATE_LIMIT = 'RATE_LIMIT',
  SERVER = 'SERVER',
  DOWNLOAD = 'DOWNLOAD',
  STORAGE = 'STORAGE',
  UNKNOWN = 'UNKNOWN',
}

export interface AppError {
  type: ErrorType;
  message: string;
  code?: string | undefined;
  details?: any;
  timestamp: number;
  retryable: boolean;
}

export class MangaNetworkError extends Error {
  public readonly type = ErrorType.NETWORK;
  public readonly retryable = true;
  public readonly timestamp = Date.now();

  constructor(
    message: string,
    public readonly code?: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MangaNetworkError';
  }
}

export class MangaValidationError extends Error {
  public readonly type = ErrorType.VALIDATION;
  public readonly retryable = false;
  public readonly timestamp = Date.now();

  constructor(
    message: string,
    public readonly field?: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MangaValidationError';
  }
}

export class MangaCacheError extends Error {
  public readonly type = ErrorType.CACHE;
  public readonly retryable = true;
  public readonly timestamp = Date.now();

  constructor(
    message: string,
    public readonly operation?: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MangaCacheError';
  }
}

export class MangaParsingError extends Error {
  public readonly type = ErrorType.PARSING;
  public readonly retryable = false;
  public readonly timestamp = Date.now();

  constructor(
    message: string,
    public readonly source?: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MangaParsingError';
  }
}

export class MangaNotFoundError extends Error {
  public readonly type = ErrorType.NOT_FOUND;
  public readonly retryable = false;
  public readonly timestamp = Date.now();

  constructor(
    message: string,
    public readonly id?: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MangaNotFoundError';
  }
}

export class MangaDownloadError extends Error {
  public readonly type = ErrorType.DOWNLOAD;
  public readonly retryable = true;
  public readonly timestamp = Date.now();

  constructor(
    message: string,
    public readonly mangaId?: string,
    public readonly chapterNumber?: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MangaDownloadError';
  }
}

export class MangaStorageError extends Error {
  public readonly type = ErrorType.STORAGE;
  public readonly retryable = false;
  public readonly timestamp = Date.now();

  constructor(
    message: string,
    public readonly operation?: string,
    public readonly details?: any
  ) {
    super(message);
    this.name = 'MangaStorageError';
  }
}

export function createAppError(
  type: ErrorType,
  message: string,
  options: {
    code?: string;
    details?: any;
    retryable?: boolean;
  } = {}
): AppError {
  return {
    type,
    message,
    code: options.code,
    details: options.details,
    timestamp: Date.now(),
    retryable: options.retryable ?? true,
  };
}

export function isRetryableError(error: Error | AppError): boolean {
  if ('retryable' in error) {
    return error.retryable;
  }

  // Network errors are generally retryable
  if (error.message.includes('network') || error.message.includes('timeout')) {
    return true;
  }

  // Validation errors are not retryable
  if (
    error.message.includes('validation') ||
    error.message.includes('invalid')
  ) {
    return false;
  }

  // Default to retryable for unknown errors
  return true;
}

export function getErrorType(error: Error): ErrorType {
  if ('type' in error && typeof error.type === 'string') {
    return error.type as ErrorType;
  }

  const message = error.message.toLowerCase();

  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('connection')
  ) {
    return ErrorType.NETWORK;
  }

  if (
    message.includes('validation') ||
    message.includes('invalid') ||
    message.includes('required')
  ) {
    return ErrorType.VALIDATION;
  }

  if (message.includes('cache')) {
    return ErrorType.CACHE;
  }

  if (message.includes('download')) {
    return ErrorType.DOWNLOAD;
  }

  if (
    message.includes('storage') ||
    message.includes('disk') ||
    message.includes('space')
  ) {
    return ErrorType.STORAGE;
  }

  if (message.includes('parse') || message.includes('parsing')) {
    return ErrorType.PARSING;
  }

  if (message.includes('not found') || message.includes('404')) {
    return ErrorType.NOT_FOUND;
  }

  if (message.includes('rate limit') || message.includes('429')) {
    return ErrorType.RATE_LIMIT;
  }

  if (message.includes('server') || message.includes('500')) {
    return ErrorType.SERVER;
  }

  return ErrorType.UNKNOWN;
}
