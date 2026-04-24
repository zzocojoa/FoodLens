import { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { dataStore } from '../../services/dataStore';
import { analysisDataService } from './analysisDataService';
import {
  toDisplayImageUri,
} from './analysisDataUtils';
import type { LoadedAnalysisData } from './analysisDataService';
import type { ImageSourcePropType } from 'react-native';
import { parseResultRouteFlags } from '@/services/contracts/resultRoute';
import type { ResultSearchParams } from '@/services/contracts/resultRoute';

export function useAnalysisData() {
  const params = useLocalSearchParams<ResultSearchParams>();
  const { data, location, fromStore, isBarcode } = params;
  const routeFlags = parseResultRouteFlags(params);
  const fromStoreMode = routeFlags.fromStoreMode;
  
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
  const [recordId, setRecordId] = useState<string | null>(null);

  // Trigger re-calc
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadData() {
      if (isRestoring) {
        console.log("[useAnalysisData] Restoring from backup...");
      }

      try {
        const loadedData = await analysisDataService.load({
          isRestoring,
          fromStore,
          data,
          location,
          isBarcode,
        });

        if (!isActive) {
          return;
        }

        if (isRestoring) {
          console.log("[useAnalysisData] Restore success:", !!loadedData.result);
        }

        setIsRestoring(loadedData.isRestoring);
        setResult(loadedData.result);
        setLocationData(loadedData.locationData);
        setStoredImageRef(loadedData.storedImageRef);
        setImageSource(loadedData.imageSource);
        setImageDimensions(loadedData.imageDimensions);
        setRecordId(loadedData.recordId);
        setLoaded(true);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const errorName = error instanceof Error ? error.name : typeof error;
        const errorStack = error instanceof Error ? error.stack : undefined;

        console.error('[useAnalysisData] Failed to load analysis data', {
          request_id: `result-load-${Date.now().toString(36)}`,
          route: {
            fromStore,
            isBarcode,
            hasData: typeof data === 'string' || Array.isArray(data),
            hasLocation: typeof location === 'string' || Array.isArray(location),
            isRestoring,
          },
          error: errorMessage,
          error_name: errorName,
          error_stack: errorStack,
        });

        if (!isActive) {
          return;
        }

        setIsRestoring(false);
        setResult(null);
        setLocationData(null);
        setStoredImageRef(undefined);
        setImageSource(null);
        setImageDimensions(null);
        setRecordId(null);
        setLoaded(true);
      }
    }
    
    void loadData();

    return () => {
      isActive = false;
    };
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
    updateTimestamp,
    recordId,
  };
}
