import { atom, injectStore, api } from '@zedux/react';
import { ToastAtomState, ToastConfig } from '@/types/atoms';

/**
 * Toast Atom
 *
 * Manages toast notification display with auto-hide and replacement logic.
 *
 * Key behaviors:
 * - Showing a new toast while one is visible replaces it immediately
 * - Auto-hides after `config.duration` ms (default: 2500ms)
 * - Clearing the timeout on replacement prevents double-hide
 *
 * Dependencies: none
 * Persistence: none (ephemeral state)
 *
 * @see hooks/useToast.ts for React hook access
 * @see Requirements 4.1–4.4
 */
export const toastAtom = atom('toast', () => {
  const store = injectStore<ToastAtomState>({
    config: null,
    isVisible: false,
  });

  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const hideToast = () => {
    store.setState({
      config: null,
      isVisible: false,
    });
  };

  const showToast = (config: ToastConfig) => {
    // Clear any existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }

    // Replace current toast with new one
    store.setState({
      config,
      isVisible: true,
    });

    // Auto-hide after duration
    const duration = config.duration || 2500;
    timeoutId = setTimeout(() => {
      hideToast();
    }, duration);
  };

  return api(store).setExports({
    showToast,
    hideToast,
  });
});

// Export function for easy access
export const showToast = (config: ToastConfig) => {
  // This will be called from components, but we need to get the atom instance
  // For now, we'll export this and the hook will handle the actual call
  return config;
};
