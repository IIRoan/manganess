import { atom, injectStore, api } from '@zedux/react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  applyUpdate,
  areUpdatesAvailable,
  checkForUpdate,
  downloadUpdate,
  getUnavailableReason,
  isUpdateLocked,
} from '@/services/updateService';

export type AppUpdatePhase =
  'idle' | 'checking' | 'available' | 'downloading' | 'restarting' | 'error';

export interface AppUpdateState {
  phase: AppUpdatePhase;
  visible: boolean;
  error: string | null;
  updateId: string | null;
  isPending: boolean;
  isDownloaded: boolean;
  lastResultMessage: string | null;
}

const INITIAL_STATE: AppUpdateState = {
  phase: 'idle',
  visible: false,
  error: null,
  updateId: null,
  isPending: false,
  isDownloaded: false,
  lastResultMessage: null,
};

const canDismissPhase = (phase: AppUpdatePhase): boolean =>
  phase === 'available' || phase === 'error' || phase === 'idle';

/**
 * In-app OTA update flow. The app owns check / download / restart;
 * expo-updates must not auto-apply on launch.
 */
export const appUpdateAtom = atom('appUpdate', () => {
  const store = injectStore<AppUpdateState>(INITIAL_STATE);
  let dismissedUpdateId: string | null = null;
  let appStateSubscription: { remove: () => void } | null = null;
  let currentAppState: AppStateStatus = AppState.currentState;

  const patch = (updates: Partial<AppUpdateState>) => {
    store.setState({
      ...store.getState(),
      ...updates,
    });
  };

  const check = async (options: { showPrompt?: boolean } = {}) => {
    const showPrompt = options.showPrompt !== false;

    if (!areUpdatesAvailable()) {
      const reason = getUnavailableReason();
      patch({
        lastResultMessage: reason,
      });
      return;
    }

    if (isUpdateLocked()) {
      return;
    }

    const current = store.getState();
    if (
      current.phase === 'downloading' ||
      current.phase === 'restarting' ||
      current.phase === 'checking'
    ) {
      return;
    }

    if (current.isPending || current.isDownloaded) {
      const alreadyDismissed = dismissedUpdateId === current.updateId;
      if (showPrompt && !alreadyDismissed) {
        patch({
          phase: 'available',
          visible: true,
          error: null,
        });
      }
      return;
    }

    patch({
      phase: 'checking',
      error: null,
    });

    const result = await checkForUpdate();

    if (result.success) {
      const updateId = result.updateId ?? 'available';
      const alreadyDismissed = dismissedUpdateId === updateId;
      patch({
        phase: 'available',
        visible: showPrompt && !alreadyDismissed,
        updateId,
        isPending: true,
        isDownloaded: false,
        error: null,
        lastResultMessage: result.message,
      });
      return;
    }

    patch({
      phase: 'idle',
      visible: false,
      isPending: false,
      lastResultMessage: result.message,
    });
  };

  const install = async () => {
    if (!areUpdatesAvailable()) {
      return;
    }

    patch({
      phase: 'downloading',
      visible: true,
      error: null,
    });

    const result = await downloadUpdate();

    if (!result.success) {
      patch({
        phase: 'error',
        visible: true,
        error: result.message,
        lastResultMessage: result.message,
      });
      return;
    }

    patch({
      phase: 'restarting',
      visible: true,
      isPending: true,
      isDownloaded: true,
      error: null,
      lastResultMessage: result.message,
    });

    const applyResult = await applyUpdate();

    if (!applyResult.success) {
      patch({
        phase: 'error',
        visible: true,
        error: applyResult.message,
        lastResultMessage: applyResult.message,
      });
    }
  };

  const restart = async () => {
    patch({
      phase: 'restarting',
      visible: true,
      error: null,
    });

    const applyResult = await applyUpdate();

    if (!applyResult.success) {
      patch({
        phase: 'error',
        visible: true,
        error: applyResult.message,
        lastResultMessage: applyResult.message,
      });
    }
  };

  const dismiss = () => {
    const current = store.getState();
    if (!canDismissPhase(current.phase)) {
      return;
    }

    if (current.updateId) {
      dismissedUpdateId = current.updateId;
    }

    patch({
      visible: false,
      phase: current.isPending ? 'available' : 'idle',
      error: null,
    });
  };

  const openFromSettings = async () => {
    dismissedUpdateId = null;
    const current = store.getState();

    if (current.isPending || current.isDownloaded) {
      patch({
        phase: 'available',
        visible: true,
        error: null,
      });
      return;
    }

    await check({ showPrompt: true });
  };

  const startListening = () => {
    if (appStateSubscription) {
      return;
    }

    void check({ showPrompt: true });

    appStateSubscription = AppState.addEventListener(
      'change',
      (nextAppState: AppStateStatus) => {
        if (
          currentAppState.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          void check({ showPrompt: true });
        }
        currentAppState = nextAppState;
      }
    );
  };

  const stopListening = () => {
    appStateSubscription?.remove();
    appStateSubscription = null;
  };

  return api(store).setExports({
    check,
    install,
    restart,
    dismiss,
    openFromSettings,
    startListening,
    stopListening,
  });
});
