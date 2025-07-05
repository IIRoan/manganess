// Performance monitoring utilities

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
}

class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetric> = new Map();
  private isEnabled: boolean = __DEV__; // Only enable in development

  private constructor() {}

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startMeasure(name: string): void {
    if (!this.isEnabled) return;

    this.metrics.set(name, {
      name,
      startTime: performance.now(),
    });
  }

  endMeasure(name: string): number | null {
    if (!this.isEnabled) return null;

    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`Performance metric "${name}" was not started`);
      return null;
    }

    const endTime = performance.now();
    const duration = endTime - metric.startTime;

    metric.endTime = endTime;
    metric.duration = duration;

    if (duration > 100) {
      // Log slow operations (>100ms)
      console.log(`[Performance] ${name}: ${duration.toFixed(2)}ms`);
    }

    return duration;
  }

  measureAsync<T>(name: string, operation: () => Promise<T>): Promise<T> {
    if (!this.isEnabled) return operation();

    this.startMeasure(name);
    return operation().finally(() => {
      this.endMeasure(name);
    });
  }

  measureSync<T>(name: string, operation: () => T): T {
    if (!this.isEnabled) return operation();

    this.startMeasure(name);
    try {
      return operation();
    } finally {
      this.endMeasure(name);
    }
  }

  getMetrics(): PerformanceMetric[] {
    return Array.from(this.metrics.values());
  }

  clearMetrics(): void {
    this.metrics.clear();
  }

  enable(): void {
    this.isEnabled = true;
  }

  disable(): void {
    this.isEnabled = false;
  }
}

export const performanceMonitor = PerformanceMonitor.getInstance();

// React hook for measuring component render times
export function useRenderTime(componentName: string) {
  if (__DEV__) {
    performanceMonitor.startMeasure(`render:${componentName}`);

    return () => {
      performanceMonitor.endMeasure(`render:${componentName}`);
    };
  }

  return () => {}; // No-op in production
}

// Decorator for measuring function execution time
export function measureExecutionTime(
  target: any,
  propertyName: string,
  descriptor: PropertyDescriptor
) {
  if (!__DEV__) return descriptor;

  const method = descriptor.value;

  descriptor.value = function (...args: any[]) {
    const functionName = `${target.constructor.name}.${propertyName}`;
    return performanceMonitor.measureSync(functionName, () =>
      method.apply(this, args)
    );
  };

  return descriptor;
}

// Utility for measuring component lifecycle
export function measureComponentLifecycle(ComponentClass: any) {
  if (!__DEV__) return ComponentClass;

  const originalRender = ComponentClass.prototype.render;
  const componentName = ComponentClass.name;

  ComponentClass.prototype.render = function () {
    const endMeasure = useRenderTime(componentName);
    const result = originalRender.call(this);
    endMeasure();
    return result;
  };

  return ComponentClass;
}

export default performanceMonitor;
