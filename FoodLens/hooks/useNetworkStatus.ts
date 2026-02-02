import { useState, useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export const useNetworkStatus = () => {
  const [networkState, setNetworkState] = useState<NetInfoState | null>(null);

  useEffect(() => {
    let unsubscribe: () => void;
    
    try {
        // Subscribe to network state updates
        unsubscribe = NetInfo.addEventListener(state => {
          setNetworkState(state);
        });
    } catch (e) {
        console.warn("NetInfo native module not found. Defaulting to online.");
        // Mock default state
        setNetworkState({
            isConnected: true,
            isInternetReachable: true,
            type: 'wifi',
            details: null,
        } as any);
        unsubscribe = () => {};
    }

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const isConnected = networkState?.isConnected ?? true; // Optimistic default
  const isInternetReachable = networkState?.isInternetReachable ?? true;

  return {
    isConnected,
    isInternetReachable,
    type: networkState?.type,
    networkState
  };
};
