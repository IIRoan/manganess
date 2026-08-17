import { useEffect, useRef } from 'react';
import { usePathname } from 'expo-router';
import { appStartTs } from '@/constants/env';
import { reportMetric } from '@/services/telemetryService';
import { sanitizeTelemetryRoute } from '@/utils/sanitizeTelemetryRoute';

export type MarkInteractiveOptions = {
  /** `appStart` is only for splash hide. Screens should use mount (default). */
  from?: 'mount' | 'appStart';
  metric?: string;
};

function nowMs(): number {
  return (
    (
      globalThis as { performance?: { now?: () => number } }
    ).performance?.now?.() ?? Date.now()
  );
}

/**
 * Records time-to-interactive for the current route once `ready` is true.
 * Screen TTI is from mount (or pathname change), not from process start.
 * Dropping `ready` during a reload clears the one-shot flag so later loads report.
 */
export function useMarkInteractive(
  ready = true,
  options?: MarkInteractiveOptions
): void {
  const pathname = usePathname();
  const from = options?.from ?? 'mount';
  const metric = options?.metric ?? 'tti';
  const sentFor = useRef<string | null>(null);
  const trackedPath = useRef(pathname);
  const mountTs = useRef(nowMs());

  if (from === 'mount' && trackedPath.current !== pathname) {
    trackedPath.current = pathname;
    mountTs.current = nowMs();
    sentFor.current = null;
  }

  useEffect(() => {
    if (!ready) {
      sentFor.current = null;
      return;
    }
    const key = from === 'appStart' ? 'app' : pathname;
    if (sentFor.current === key) {
      return;
    }
    sentFor.current = key;
    const start = from === 'appStart' ? appStartTs : mountTs.current;
    reportMetric({
      name: metric,
      durationMs: Math.round(nowMs() - start),
      route: sanitizeTelemetryRoute(pathname),
    });
  }, [ready, pathname, from, metric]);
}
