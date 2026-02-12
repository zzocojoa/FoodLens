import { useState, useEffect } from 'react';
import { Image } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { dataStore } from '../../services/dataStore';
import { resolveImageUri } from '../../services/imageStorage';

export function useAnalysisData() {
  const { data, location, imageUri, fromStore, isBarcode } = useLocalSearchParams();
  
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
            
            // Priority: Barcode Background
            if (stored.result?.isBarcode || isBarcode === 'true') {
                const barcodeBg = require('@/assets/images/barcode_bg.png');
                const assetSource = Image.resolveAssetSource(barcodeBg);
                setImageSource(barcodeBg);
                setImageDimensions({ width: assetSource.width, height: assetSource.height });
            } else {
                setImageSource(stored.imageUri ? { uri: resolveImageUri(stored.imageUri) } : null);
                setImageDimensions(null);
            }
          }
      } else {
        // Normal Load
        if (fromStore === 'true') {
            const stored = dataStore.getData();
            setResult(stored.result);
            setLocationData(stored.location);
            setStoredImageRef(stored.imageUri || undefined);
            
            // Priority: Barcode Background
            if (stored.result?.isBarcode || isBarcode === 'true') {
                const barcodeBg = require('@/assets/images/barcode_bg.png');
                const assetSource = Image.resolveAssetSource(barcodeBg);
                setImageSource(barcodeBg);
                setImageDimensions({ width: assetSource.width, height: assetSource.height });
            } else {
                setImageSource(stored.imageUri ? { uri: resolveImageUri(stored.imageUri) } : null);
                setImageDimensions(null);
            }
        } else {
            const parsedResult = typeof data === 'string' ? JSON.parse(data) : null;
            setResult(parsedResult);
            setLocationData(typeof location === 'string' ? JSON.parse(location) : null);
            
            const storedData = dataStore.getData();
            setStoredImageRef(storedData.imageUri || undefined);

            // Priority: Barcode Background (Override even if imageUri exists from API)
            if (parsedResult?.isBarcode || isBarcode === 'true') {
                 const barcodeBg = require('@/assets/images/barcode_bg.png');
                 const assetSource = Image.resolveAssetSource(barcodeBg);
                 setImageSource(barcodeBg);
                 setImageDimensions({ width: assetSource.width, height: assetSource.height });
            } else if (storedData.imageUri) {
                setImageSource({ uri: resolveImageUri(storedData.imageUri) });
                setImageDimensions(null);
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
    imageDimensions,
    rawImageUri: storedImageRef,    // Filename only — for AnalysisService persistence
    displayImageUri: (typeof imageSource === 'number' && imageSource) 
        ? Image.resolveAssetSource(imageSource).uri 
        : imageSource?.uri, // Resolved absolute path — for Image display/sizing
    timestamp,
    updateTimestamp
  };
}

