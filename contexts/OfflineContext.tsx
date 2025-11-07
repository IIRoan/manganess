import React, { createContext, useContext, useEffect, useState } from 'react';
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

export const OfflineProvider: React.FC<OfflineProviderProps> = ({
  children,
}) => {
  const networkState = useNetworkStatus();
  const [showOfflineIndicator, setShowOfflineIndicator] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    // Show offline indicator when going offline
    if (networkState.isOffline) {
      setShowOfflineIndicator(true);
      logger().info('Network', 'Device went offline', {
        type: networkState.type,
        isConnected: networkState.isConnected,
        isInternetReachable: networkState.isInternetReachable,
      });
    } else {
      // Hide indicator after a delay when coming back online
      timer = setTimeout(() => {
        setShowOfflineIndicator(false);
      }, 2000);

      logger().info('Network', 'Device came online', {
        type: networkState.type,
        isConnected: networkState.isConnected,
        isInternetReachable: networkState.isInternetReachable,
      });
    }

    return () => {
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [
    networkState.isOffline,
    networkState.type,
    networkState.isConnected,
    networkState.isInternetReachable,
  ]);

  const value: OfflineContextType = {
    isOffline: networkState.isOffline,
    isConnected: networkState.isConnected,
    networkType: networkState.type,
    showOfflineIndicator,
  };

  return (
    <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
  );
};
