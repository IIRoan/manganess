/**
 * Download optimization utilities to prevent UI blocking and improve performance
 */

import { logger } from './logger';
import { isDebugEnabled } from '@/constants/env';

const log = logger();

/**
 * Throttle function calls to prevent excessive execution
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: any = null;
  let lastExecTime = 0;

  return (...args: Parameters<T>) => {
    const currentTime = Date.now();

    if (currentTime - lastExecTime > delay) {
      // Execute immediately if enough time has passed
      lastExecTime = currentTime;
      func(...args);
    } else {
      // Schedule execution for later
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      timeoutId = setTimeout(
        () => {
          lastExecTime = Date.now();
          func(...args);
          timeoutId = null;
        },
        delay - (currentTime - lastExecTime)
      );
    }
  };
}

/**
 * Debounce function calls to prevent rapid successive execution
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: any = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Execute a function in the next tick to prevent UI blocking
 */
export function nextTick<T>(func: () => T): Promise<T> {
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        const result = func();
        resolve(result);
      } catch (error) {
        if (isDebugEnabled()) {
          log.error('Service', 'NextTick execution failed', { error });
        }
        throw error;
      }
    }, 0);
  });
}

/**
 * Execute an async function in the next tick
 */
export function nextTickAsync<T>(func: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(async () => {
      try {
        const result = await func();
        resolve(result);
      } catch (error) {
        if (isDebugEnabled()) {
          log.error('Service', 'NextTickAsync execution failed', { error });
        }
        reject(error);
      }
    }, 0);
  });
}

/**
 * Process an array in batches to prevent blocking
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R[]>,
  delayBetweenBatches = 0
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    if (isDebugEnabled()) {
      log.debug('Service', 'Processing batch', {
        batchNumber: Math.floor(i / batchSize) + 1,
        batchSize: batch.length,
        totalBatches: Math.ceil(items.length / batchSize),
      });
    }

    const batchResults = await processor(batch);
    results.push(...batchResults);

    // Add delay between batches if specified
    if (delayBetweenBatches > 0 && i + batchSize < items.length) {
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }
  }

  return results;
}

/**
 * Create a rate limiter that prevents too many operations per time window
 */
export function createRateLimiter(maxOperations: number, windowMs: number) {
  const operations: number[] = [];

  return {
    canExecute(): boolean {
      const now = Date.now();

      // Remove operations outside the current window
      while (operations.length > 0 && operations[0]! <= now - windowMs) {
        operations.shift();
      }

      // Check if we can add another operation
      if (operations.length < maxOperations) {
        operations.push(now);
        return true;
      }

      return false;
    },

    waitTime(): number {
      if (operations.length === 0) return 0;

      const oldestOperation = operations[0]!;
      const timeUntilExpiry = oldestOperation + windowMs - Date.now();

      return Math.max(0, timeUntilExpiry);
    },
  };
}

/**
 * Memory-efficient queue processor
 */
export class OptimizedQueue<T> {
  private items: T[] = [];
  private processing = false;
  private maxConcurrent: number;
  private delayBetweenItems: number;

  constructor(maxConcurrent = 3, delayBetweenItems = 100) {
    this.maxConcurrent = maxConcurrent;
    this.delayBetweenItems = delayBetweenItems;
  }

  add(item: T): void {
    this.items.push(item);
    this.processNext();
  }

  addBatch(items: T[]): void {
    this.items.push(...items);
    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.items.length === 0) {
      return;
    }

    this.processing = true;

    try {
      while (this.items.length > 0) {
        const batch = this.items.splice(0, this.maxConcurrent);

        // Process batch items concurrently
        await Promise.allSettled(batch.map((item) => this.processItem(item)));

        // Add delay between batches
        if (this.items.length > 0 && this.delayBetweenItems > 0) {
          await new Promise((resolve) =>
            setTimeout(resolve, this.delayBetweenItems)
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }

  protected async processItem(item: T): Promise<void> {
    // Override this method in subclasses
    if (isDebugEnabled()) {
      log.debug('Service', 'Processing queue item', { item });
    }
  }

  clear(): void {
    this.items = [];
  }

  size(): number {
    return this.items.length;
  }

  isEmpty(): boolean {
    return this.items.length === 0;
  }
}
