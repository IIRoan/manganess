import { atom, injectStore, injectEffect } from '@zedux/react';
import NetInfo from '@react-native-community/netinfo';
import { NetworkAtomState } from '@/types/atoms';
import { logger } from '@/utils/logger';

// Debounce delays (in milliseconds)
const OFFLINE_DEBOUNCE_DELAY = 5000; // Wait 5 seconds before marking as offline
const ONLINE_INDICATOR_DEBOUNCE_DELAY = 2000; // Wait 2 seconds before hiding offline indicator

/**
 * Network Atom
 *
 * Manages network connectivity status with debouncing to avoid flickering.
 *
 * Key behaviors:
 * - Subscribes to NetInfo once (singleton subscription via Zedux)
 * - Going offline: waits 5s before setting isOffline=true (avoids false positives)
 * - Coming online: clears isOffline immediately, hides indicator after 2s
 *
 * Dependencies: NetInfo (external subscription)
 * Persistence: none (ephemeral state)
 *
 * @see hooks/useOffline.ts for React hook access
 * @see Requirements 3.1–3.5
 */
export const networkAtom = atom('network', () => {
  const store = injectStore<NetworkAtomState>({
    isOffline: false,
    isConnected: true,
    networkType: 'unknown',
    isInternetReachable: null,
    showOfflineIndicator: false,
  });

  let offlineTimerId: ReturnType<typeof setTimeout> | null = null;
  let onlineTimerId: ReturnType<typeof setTimeout> | null = null;

  injectEffect(() => {
    // Get initial network state
    NetInfo.fetch().then((state) => {
      const isOffline =
        !state.isConnected || state.isInternetReachable === false;
      store.setState({
        isOffline,
        isConnected: state.isConnected ?? false,
        networkType: state.type,
        isInternetReachable: state.isInternetReachable,
        showOfflineIndicator: isOffline,
      });
    });

    // Subscribe to network state changes
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isCurrentlyOffline =
        !state.isConnected || state.isInternetReachable === false;

      if (isCurrentlyOffline) {
        // Cancel pending hide-indicator timer when connectivity drops again
        if (onlineTimerId) {
          clearTimeout(onlineTimerId);
          onlineTimerId = null;
        }

        // Clear any pending offline timer before scheduling a new one
        if (offlineTimerId) {
          clearTimeout(offlineTimerId);
        }

        // Only mark as offline after a delay to account for short connectivity losses
        offlineTimerId = setTimeout(() => {
          store.setState({
            isOffline: true,
            isConnected: state.isConnected ?? false,
            networkType: state.type,
            isInternetReachable: state.isInternetReachable,
            showOfflineIndicator: true,
          });
          logger().info('Network', 'Device went offline (after debounce)', {
            type: state.type,
            isConnected: state.isConnected,
            isInternetReachable: state.isInternetReachable,
          });
        }, OFFLINE_DEBOUNCE_DELAY);
      } else {
        // Clear any pending offline timer
        if (offlineTimerId) {
          clearTimeout(offlineTimerId);
          offlineTimerId = null;
        }

        // Mark as online immediately
        store.setState({
          isOffline: false,
          isConnected: state.isConnected ?? false,
          networkType: state.type,
          isInternetReachable: state.isInternetReachable,
          showOfflineIndicator: store.getState().showOfflineIndicator, // Keep current indicator state
        });

        // Clear any pending online timer before scheduling a new one
        if (onlineTimerId) {
          clearTimeout(onlineTimerId);
        }

        // Hide indicator with a delay
        onlineTimerId = setTimeout(() => {
          store.setState({
            ...store.getState(),
            showOfflineIndicator: false,
          });
        }, ONLINE_INDICATOR_DEBOUNCE_DELAY);

        logger().info('Network', 'Device came online', {
          type: state.type,
          isConnected: state.isConnected,
          isInternetReachable: state.isInternetReachable,
        });
      }
    });

    // Cleanup function
    return () => {
      unsubscribe();
      if (offlineTimerId) {
        clearTimeout(offlineTimerId);
        offlineTimerId = null;
      }
      if (onlineTimerId) {
        clearTimeout(onlineTimerId);
        onlineTimerId = null;
      }
    };
  }, []);

  return store;
});
