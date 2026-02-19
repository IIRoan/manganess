import { useAtomValue } from '@zedux/react';
import { networkAtom } from '@/atoms/networkAtom';

export const useOffline = () => {
  const state = useAtomValue(networkAtom);

  return {
    isOffline: state.isOffline,
    isConnected: state.isConnected,
    networkType: state.networkType,
    showOfflineIndicator: state.showOfflineIndicator,
  };
};
