import { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { dataStore } from '../../services/dataStore';
import { analysisDataService } from './analysisDataService';
import {
  toDisplayImageUri,
} from './analysisDataUtils';
import type { LoadedAnalysisData } from './analysisDataService';
import type { ImageSourcePropType } from 'react-native';

type AnalysisParams = {
  data?: string | string[];
  location?: string | string[];
  fromStore?: string | string[];
  isBarcode?: string | string[];
};

export function useAnalysisData() {
  const { data, location, fromStore, isBarcode } = useLocalSearchParams<AnalysisParams>();
  const fromStoreMode = fromStore === 'true';
  
  // State for restoring from backup (Crash Recovery)
  const [isRestoring, setIsRestoring] = useState(
    fromStoreMode && !dataStore.getData().result
  );
  
  // Data holders
  const [result, setResult] = useState<LoadedAnalysisData['result']>(null);
  const [locationData, setLocationData] = useState<LoadedAnalysisData['locationData']>(null);
  const [imageSource, setImageSource] = useState<ImageSourcePropType | null>(null);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null);
  
  // Stored image reference (filename only — for persistence)
  // This is separate from imageSource.uri which is the resolved absolute path for display
  const [storedImageRef, setStoredImageRef] = useState<string | undefined>();

  // Trigger re-calc
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (isRestoring) {
        console.log("[useAnalysisData] Restoring from backup...");
      }

      const loadedData = await analysisDataService.load({
        isRestoring,
        fromStore,
        data,
        location,
        isBarcode,
      });

      if (isRestoring) {
        console.log("[useAnalysisData] Restore success:", !!loadedData.result);
      }

      setIsRestoring(loadedData.isRestoring);
      setResult(loadedData.result);
      setLocationData(loadedData.locationData);
      setStoredImageRef(loadedData.storedImageRef);
      setImageSource(loadedData.imageSource);
      setImageDimensions(loadedData.imageDimensions);
      setLoaded(true);
    }
    
    void loadData();
  }, [data, fromStore, isBarcode, isRestoring, location]);

  // Reactive timestamp state
  const [timestamp, setTimestamp] = useState<string | undefined>(
    isRestoring || fromStoreMode ? dataStore.getData().timestamp || undefined : undefined
  );

  // Sync with dataStore if we are in store mode
  useEffect(() => {
    if (loaded && (isRestoring || fromStoreMode)) {
        const stored = dataStore.getData();
        setTimestamp(stored.timestamp || undefined);
    }
  }, [loaded, isRestoring, fromStoreMode]);

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
    imageDimensions,
    rawImageUri: storedImageRef,    // Filename only — for AnalysisService persistence
    displayImageUri: toDisplayImageUri(imageSource),
    timestamp,
    updateTimestamp
  };
}
