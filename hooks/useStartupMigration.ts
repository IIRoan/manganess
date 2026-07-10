import { useCallback, useEffect, useRef, useState } from 'react';
import { useAtomInstance } from '@zedux/react';
import {
  detectLegacyStorageNeeds,
  runStartupMigration,
  STARTUP_MIGRATION_MESSAGES,
  type StartupMigrationProgress,
} from '@/services/startupMigrationService';
import {
  clearLibraryDataChangedFlag,
  markLibraryDataChanged,
} from '@/services/appLibraryRefreshService';
import { libraryRefreshAtom } from '@/atoms/libraryRefreshAtom';
import { useBookmarks } from '@/hooks/useBookmarks';
import { logger } from '@/utils/logger';

const COMPLETE_MESSAGE_DURATION_MS = 1500;

export function useStartupMigration() {
  const { refreshBookmarks } = useBookmarks();
  const libraryRefresh = useAtomInstance(libraryRefreshAtom);
  const [progress, setProgress] = useState<StartupMigrationProgress | null>(
    null
  );
  const [isVisible, setIsVisible] = useState(false);
  const hasStartedRef = useRef(false);

  const refreshAppLibrary = useCallback(async () => {
    await markLibraryDataChanged();
    await refreshBookmarks();
    libraryRefresh.exports.bump();
    await clearLibraryDataChangedFlag();
  }, [libraryRefresh.exports, refreshBookmarks]);

  const hideOverlay = useCallback(() => {
    setTimeout(() => {
      setIsVisible(false);
      setProgress(null);
    }, COMPLETE_MESSAGE_DURATION_MS);
  }, []);

  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }

    hasStartedRef.current = true;
    let cancelled = false;

    const run = async () => {
      try {
        const detection = await detectLegacyStorageNeeds();
        if (cancelled || !detection.needsMigration) {
          return;
        }

        let showedModal = false;

        const result = await runStartupMigration((nextProgress) => {
          if (cancelled || nextProgress.phase === 'complete') {
            return;
          }

          showedModal = true;
          setIsVisible(true);
          setProgress(nextProgress);
        });

        if (cancelled) {
          return;
        }

        const didMigrate =
          result.storageMigrated > 0 || result.idsRemapped > 0;

        if (result.outcome === 'completed' && didMigrate) {
          try {
            await refreshAppLibrary();
          } catch (error) {
            logger().warn(
              'Service',
              'Failed to refresh app library after startup migration',
              {
                error: error instanceof Error ? error.message : String(error),
              }
            );
          }

          setProgress({
            phase: 'complete',
            ...STARTUP_MIGRATION_MESSAGES.complete,
          });
          hideOverlay();
          return;
        }

        if (result.outcome === 'failed' && showedModal) {
          setIsVisible(false);
          setProgress(null);
        }
      } catch (error) {
        if (!cancelled) {
          logger().error('Service', 'Startup migration crashed', { error });
          setIsVisible(false);
          setProgress(null);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [hideOverlay, refreshAppLibrary]);

  return {
    progress,
    isVisible,
  };
}
