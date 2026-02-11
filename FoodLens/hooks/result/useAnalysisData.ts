import { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { dataStore } from '../../services/dataStore';
import { resolveImageUri } from '../../services/imageStorage';

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
  
  // Stored image reference (filename only — for persistence)
  // This is separate from imageSource.uri which is the resolved absolute path for display
  const [storedImageRef, setStoredImageRef] = useState<string | undefined>();

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
            setStoredImageRef(stored.imageUri || undefined);
            setImageSource(stored.imageUri ? { uri: resolveImageUri(stored.imageUri) } : null);
          }
      } else {
        // Normal Load
        if (fromStore === 'true') {
            const stored = dataStore.getData();
            setResult(stored.result);
            setLocationData(stored.location);
            setStoredImageRef(stored.imageUri || undefined);
            setImageSource(stored.imageUri ? { uri: resolveImageUri(stored.imageUri) } : null);
        } else {
            setResult(typeof data === 'string' ? JSON.parse(data) : null);
            setLocationData(typeof location === 'string' ? JSON.parse(location) : null);
            // New analysis from camera: dataStore already has imageUri (filename) set by camera.tsx
            const storedData = dataStore.getData();
            if (storedData.imageUri) {
                setStoredImageRef(storedData.imageUri);
                setImageSource({ uri: resolveImageUri(storedData.imageUri) });
            }
        }
      }
      setLoaded(true);
    }
    
    loadData();
  }, [isRestoring, fromStore, data, location]);

  // Reactive timestamp state
  const [timestamp, setTimestamp] = useState<string | undefined>(
    isRestoring || fromStore === 'true' ? dataStore.getData().timestamp || undefined : undefined
  );

  // Sync with dataStore if we are in store mode
  useEffect(() => {
    if (loaded && (isRestoring || fromStore === 'true')) {
        const stored = dataStore.getData();
        setTimestamp(stored.timestamp || undefined);
    }
  }, [loaded, isRestoring, fromStore]);

  const updateTimestamp = (newDate: Date) => {
      const isoString = newDate.toISOString();
      setTimestamp(isoString);
      dataStore.updateTimestamp(isoString);
  };

  return {
    isRestoring,
    loaded,
    result,
    locationData,
    imageSource,
    rawImageUri: storedImageRef,    // Filename only — for AnalysisService persistence
    displayImageUri: imageSource?.uri, // Resolved absolute path — for Image display/sizing
    timestamp,
    updateTimestamp
  };
}

