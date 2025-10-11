import { useEffect, useRef } from 'react';
import { InteractionManager } from 'react-native';
import { usePathname } from 'expo-router';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';

export function useNavigationPerf() {
  const pathname = usePathname();
  const prev = useRef<string | null>(null);
  const startRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isDebugEnabled()) return;
    const log = logger();
    const from = prev.current;
    const to = pathname;
    prev.current = pathname;

    if (from === null) return; // first mount

    startRef.current = (globalThis as any).performance?.now?.() ?? Date.now();
    log.info('Navigation', 'routeChangeStart', { from, to });

    requestAnimationFrame(() => {
      InteractionManager.runAfterInteractions(() => {
        const start =
          startRef.current ??
          (globalThis as any).performance?.now?.() ??
          Date.now();
        const dur =
          ((globalThis as any).performance?.now?.() ?? Date.now()) - start;
        log.info('Navigation', 'routeChangeComplete', {
          from,
          to,
          durationMs: Math.round(dur),
        });
      });
    });
  }, [pathname]);
}
