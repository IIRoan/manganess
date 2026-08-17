import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { usePathname } from 'expo-router';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';
import { reportMetric } from '@/services/telemetryService';
import { sanitizeTelemetryRoute } from '@/utils/sanitizeTelemetryRoute';

export function useNavigationPerf() {
  const pathname = usePathname();
  const prev = useRef<string | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    const log = logger();
    const from = prev.current;
    const to = pathname;
    prev.current = pathname;

    if (from === null) {
      return;
    }

    startRef.current =
      (globalThis as { performance?: { now?: () => number } }).performance
        ?.now?.() ?? Date.now();
    if (isDebugEnabled()) {
      log.info('Navigation', 'routeChangeStart', { from, to });
    }

    requestAnimationFrame(() => {
      InteractionManager.runAfterInteractions(() => {
        const start =
          startRef.current ??
          (globalThis as { performance?: { now?: () => number } }).performance
            ?.now?.() ??
          Date.now();
        const dur =
          ((globalThis as { performance?: { now?: () => number } }).performance
            ?.now?.() ?? Date.now()) - start;
        const durationMs = Math.round(dur);
        reportMetric({
          name: 'navigation',
          durationMs,
          route: sanitizeTelemetryRoute(to),
        });
        if (isDebugEnabled()) {
          log.info('Navigation', 'routeChangeComplete', {
            from,
            to,
            durationMs,
          });
        }
      });
    });
  }, [pathname]);
}
