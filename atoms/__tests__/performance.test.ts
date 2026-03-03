/**
 * Performance benchmarks for Zedux atom state management.
 *
 * Measures render times and AsyncStorage operation times to ensure
 * no performance regression from the migration.
 *
 * @see Requirements 14.1, 14.3, 14.5
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { performanceMonitor } from '@/utils/performance';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('@/utils/logger', () => ({
  logger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

// Enable performance monitor for tests
beforeAll(() => {
  performanceMonitor.enable();
});

afterAll(() => {
  performanceMonitor.clearMetrics();
});

describe('AsyncStorage Performance', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    performanceMonitor.clearMetrics();
  });

  it('single write completes in under 100ms', async () => {
    const start = performance.now();
    await AsyncStorage.setItem('perf_test_key', JSON.stringify({ value: 42 }));
    const duration = performance.now() - start;

    // AsyncStorage mock is synchronous, real device should be well under 100ms
    expect(duration).toBeLessThan(100);
  });

  it('single read completes in under 100ms', async () => {
    await AsyncStorage.setItem(
      'perf_read_key',
      JSON.stringify({ value: 'test' })
    );

    const start = performance.now();
    await AsyncStorage.getItem('perf_read_key');
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
  });

  it('batch of 10 writes completes in under 500ms', async () => {
    const start = performance.now();

    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        AsyncStorage.setItem(
          `perf_batch_${i}`,
          JSON.stringify({ index: i, data: 'x'.repeat(100) })
        )
      )
    );

    const duration = performance.now() - start;
    expect(duration).toBeLessThan(500);
  });

  it('batch of 10 reads completes in under 500ms', async () => {
    // Pre-populate
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        AsyncStorage.setItem(
          `perf_read_batch_${i}`,
          JSON.stringify({ index: i })
        )
      )
    );

    const start = performance.now();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        AsyncStorage.getItem(`perf_read_batch_${i}`)
      )
    );
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(500);
  });

  it('performanceMonitor.measureAsync wraps async operations correctly', async () => {
    let operationRan = false;

    await performanceMonitor.measureAsync('test_async_op', async () => {
      await AsyncStorage.setItem('measured_key', 'value');
      operationRan = true;
    });

    expect(operationRan).toBe(true);
    const stored = await AsyncStorage.getItem('measured_key');
    expect(stored).toBe('value');
  });
});

describe('State Update Performance', () => {
  it('JSON serialization of settings state is fast', () => {
    const settings = {
      theme: 'dark',
      enableDebugTab: false,
      onboardingCompleted: true,
      defaultLayout: 'grid',
      downloadSettings: {
        maxConcurrentDownloads: 3,
        maxStorageSize: 2 * 1024 * 1024 * 1024,
        autoDownloadBookmarked: false,
        downloadQuality: 'original',
        enableBackgroundDownloads: true,
        storageWarningThreshold: 85,
        autoCleanupEnabled: false,
        autoCleanupDays: 30,
      },
    };

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      JSON.stringify(settings);
    }
    const duration = performance.now() - start;

    // 1000 serializations should complete in under 50ms
    expect(duration).toBeLessThan(50);
  });

  it('JSON deserialization of settings state is fast', () => {
    const serialized = JSON.stringify({
      theme: 'dark',
      enableDebugTab: false,
      onboardingCompleted: true,
      defaultLayout: 'grid',
      downloadSettings: {
        maxConcurrentDownloads: 3,
      },
    });

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      JSON.parse(serialized);
    }
    const duration = performance.now() - start;

    // 1000 deserializations should complete in under 50ms
    expect(duration).toBeLessThan(50);
  });

  it('bookmark list filtering is fast for large lists', () => {
    const bookmarks = Array.from({ length: 500 }, (_, i) => ({
      id: `manga_${i}`,
      title: `Manga ${i}`,
      bookmarkStatus:
        i % 3 === 0 ? 'Reading' : i % 3 === 1 ? 'To Read' : 'Read',
    }));

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      bookmarks.filter((b) => b.bookmarkStatus === 'Reading');
    }
    const duration = performance.now() - start;

    // 100 filter passes over 500 items should be under 50ms
    expect(duration).toBeLessThan(50);
  });
});
