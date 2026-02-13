import { useState, useEffect } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { dataStore } from '../../services/dataStore';
import {
  getBarcodeImageSource,
  getResolvedImageSource,
  isBarcodeResult,
  parseSearchParamObject,
  toDisplayImageUri,
} from './analysisDataUtils';

export function useAnalysisData() {
  const { data, location, fromStore, isBarcode } = useLocalSearchParams();
  
  // State for restoring from backup (Crash Recovery)
  const [isRestoring, setIsRestoring] = useState(
    fromStore === 'true' && !dataStore.getData().result
  );
  
  // Data holders
  const [result, setResult] = useState<any>(null);
  const [locationData, setLocationData] = useState<any>(null);
  const [imageSource, setImageSource] = useState<any>(null);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null);
  
  // Stored image reference (filename only — for persistence)
  // This is separate from imageSource.uri which is the resolved absolute path for display
  const [storedImageRef, setStoredImageRef] = useState<string | undefined>();

  // Trigger re-calc
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const applyImageSource = (
      resultData: any,
      storedImageRef: string | null | undefined,
      barcodeParam: string | string[] | undefined
    ) => {
      if (isBarcodeResult(resultData, barcodeParam)) {
        const barcode = getBarcodeImageSource();
        setImageSource(barcode.imageSource);
        setImageDimensions(barcode.imageDimensions);
        return;
      }
      const resolved = getResolvedImageSource(storedImageRef);
      setImageSource(resolved.imageSource);
      setImageDimensions(resolved.imageDimensions);
    };

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
            applyImageSource(stored.result, stored.imageUri, isBarcode);
          }
      } else {
        // Normal Load
        if (fromStore === 'true') {
            const stored = dataStore.getData();
            setResult(stored.result);
            setLocationData(stored.location);
            setStoredImageRef(stored.imageUri || undefined);
            applyImageSource(stored.result, stored.imageUri, isBarcode);
        } else {
            const parsedResult = parseSearchParamObject(data);
            setResult(parsedResult);
            setLocationData(parseSearchParamObject(location));
            
            const storedData = dataStore.getData();
            setStoredImageRef(storedData.imageUri || undefined);
            applyImageSource(parsedResult, storedData.imageUri, isBarcode);
        }
      }
      setLoaded(true);
    }
    
    loadData();
  }, [data, fromStore, isBarcode, isRestoring, location]);

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
    imageDimensions,
    rawImageUri: storedImageRef,    // Filename only — for AnalysisService persistence
    displayImageUri: toDisplayImageUri(imageSource),
    timestamp,
    updateTimestamp
  };
}
