import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';
import { logger } from '@/utils/logger';

interface OfflineContextType {
  isOffline: boolean;
  isConnected: boolean;
  networkType: string;
  showOfflineIndicator: boolean;
}

const OfflineContext = createContext<OfflineContextType>({
  isOffline: false,
  isConnected: true,
  networkType: 'unknown',
  showOfflineIndicator: false,
});

export const useOffline = () => {
  const context = useContext(OfflineContext);
  if (!context) {
    throw new Error('useOffline must be used within an OfflineProvider');
  }
  return context;
};

interface OfflineProviderProps {
  children: React.ReactNode;
}

// Debounce delays (in milliseconds)
const OFFLINE_DEBOUNCE_DELAY = 5000; // Wait 5 seconds before marking as offline
const ONLINE_DEBOUNCE_DELAY = 2000; // Wait 2 seconds before hiding offline indicator

export const OfflineProvider: React.FC<OfflineProviderProps> = ({
  children,
}) => {
  const networkState = useNetworkStatus();
  const [isOffline, setIsOffline] = useState(false);
  const [showOfflineIndicator, setShowOfflineIndicator] = useState(false);
  const offlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {

    if (networkState.isOffline) {
      // Clear any pending offline timer before scheduling a new one
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current);
      }

      // Only mark as offline after a delay to account for short connectivity losses
      offlineTimerRef.current = setTimeout(() => {
        setIsOffline(true);
        setShowOfflineIndicator(true);
        logger().info('Network', 'Device went offline (after debounce)', {
          type: networkState.type,
          isConnected: networkState.isConnected,
          isInternetReachable: networkState.isInternetReachable,
        });
      }, OFFLINE_DEBOUNCE_DELAY);
    } else {
      // Clear any pending offline timer
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }

      // Mark as online immediately, but hide indicator with a delay
      setIsOffline(false);

      // Clear any pending online timer before scheduling a new one
      if (onlineTimerRef.current) {
        clearTimeout(onlineTimerRef.current);
      }

      onlineTimerRef.current = setTimeout(() => {
        setShowOfflineIndicator(false);
      }, ONLINE_DEBOUNCE_DELAY);

      logger().info('Network', 'Device came online', {
        type: networkState.type,
        isConnected: networkState.isConnected,
        isInternetReachable: networkState.isInternetReachable,
      });
    }

    return () => {
      if (offlineTimerRef.current) {
        clearTimeout(offlineTimerRef.current);
        offlineTimerRef.current = null;
      }
      if (onlineTimerRef.current) {
        clearTimeout(onlineTimerRef.current);
        onlineTimerRef.current = null;
      }
    };
  }, [
    networkState.isOffline,
    networkState.type,
    networkState.isConnected,
    networkState.isInternetReachable,
  ]);

  const value: OfflineContextType = {
    isOffline,
    isConnected: networkState.isConnected,
    networkType: networkState.type,
    showOfflineIndicator,
  };

  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
};
