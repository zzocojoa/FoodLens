import { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { dataStore } from '../../services/dataStore';

export function useAnalysisData() {
  const { data, location, imageUri, fromStore } = useLocalSearchParams();
  
  // State for restoring from backup (Crash Recovery)
  const [isRestoring, setIsRestoring] = useState(
    fromStore === 'true' && !dataStore.getData().result
  );
  
  // Data holders
  const [result, setResult] = useState<any>(null);
  const [locationData, setLocationData] = useState<any>(null);
  const [imageSource, setImageSource] = useState<any>(null);

  // Trigger re-calc
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (isRestoring) {
          console.log("[useAnalysisData] Restoring from backup...");
          const success = await dataStore.restoreBackup();
          console.log("[useAnalysisData] Restore success:", success);
          setIsRestoring(false);
          
          if (success) {
            // Re-fetch from store after restore
            const stored = dataStore.getData();
            setResult(stored.result);
            setLocationData(stored.location);
            setImageSource(stored.imageUri ? { uri: stored.imageUri } : null);
          }
      } else {
        // Normal Load
        if (fromStore === 'true') {
            const stored = dataStore.getData();
            setResult(stored.result);
            setLocationData(stored.location);
            setImageSource(stored.imageUri ? { uri: stored.imageUri } : null);
        } else {
            setResult(typeof data === 'string' ? JSON.parse(data) : null);
            setLocationData(typeof location === 'string' ? JSON.parse(location) : null);
            // imageUri from params (if any)
            // Note: In non-store mode, imageUri might be passed as param or not used
        }
      }
      setLoaded(true);
    }
    
    loadData();
  }, [isRestoring, fromStore, data, location]);

  return {
    isRestoring,
    loaded,
    result,
    locationData,
    imageSource,
    rawImageUri: imageSource?.uri
  };
}
