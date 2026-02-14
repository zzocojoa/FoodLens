import { useCallback, useRef, useState } from 'react';
import { MutableRefObject } from 'react';
import { BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Href } from 'expo-router';
import { lookupBarcodeWithCache, normalizeBarcodeIngredients } from '../services/scanCameraBarcodeService';
import { isBarcodeInCenteredRoi, evaluateScanConfidence } from '../utils/barcodeScannerUtils';
import { createFallbackLocation } from '../utils/scanCameraMappers';
import { dataStore } from '@/services/dataStore';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { buildResultRoute } from '@/features/result/services/resultNavigationService';
import { LocationData } from '@/services/utils/types';
import { AnalyzedData } from '@/services/ai';

type Translate = (key: string, fallback?: string) => string;

type UseScanBarcodeFlowParams = {
  mode: 'LABEL' | 'FOOD' | 'BARCODE';
  scanned: boolean;
  isAnalyzing: boolean;
  isConnectedRef: MutableRefObject<boolean>;
  isProcessingRef: MutableRefObject<boolean>;
  cachedLocation: MutableRefObject<LocationData | null | undefined>;
  resetState: () => void;
  replace: (href: Href) => void;
  setScanned: (value: boolean) => void;
  setIsAnalyzing: (value: boolean) => void;
  setActiveStep: (value: number | undefined) => void;
  setMode: (mode: 'LABEL' | 'FOOD' | 'BARCODE') => void;
  t: Translate;
};

const getRawImageUrl = (product: { raw_data?: Record<string, unknown> }): string | null => {
  const candidate = product.raw_data?.['image_url'];
  return typeof candidate === 'string' ? candidate : null;
};

export const useScanBarcodeFlow = ({
  mode,
  scanned,
  isAnalyzing,
  isConnectedRef,
  isProcessingRef,
  cachedLocation,
  resetState,
  replace,
  setScanned,
  setIsAnalyzing,
  setActiveStep,
  setMode,
  t,
}: UseScanBarcodeFlowParams) => {
  const [consecutiveScans, setConsecutiveScans] = useState(0);
  const lastScannedData = useRef<string | null>(null);

  const processBarcode = useCallback(
    async (barcode: string) => {
      try {
        setIsAnalyzing(true);
        setActiveStep(0);

        if (!isConnectedRef.current) {
          showTranslatedAlert(t, {
            titleKey: 'camera.alert.offlineTitle',
            titleFallback: 'Offline',
            messageKey: 'camera.error.offline',
            messageFallback: 'Please check your internet connection.',
          });
          resetState();
          return;
        }

        const result = await lookupBarcodeWithCache(barcode);

        if (result.found && result.data) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const product = normalizeBarcodeIngredients(result.data) as AnalyzedData & {
            raw_data?: Record<string, unknown>;
          };

          const locationData = cachedLocation.current || createFallbackLocation(0, 0, 'US');
          const finalTimestamp = new Date().toISOString();

          dataStore.setData(product, locationData, getRawImageUrl(product) || '', finalTimestamp);
          replace(buildResultRoute({ isNew: true, isBarcode: true }));
          resetState();
          return;
        }

        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        setIsAnalyzing(false);
        showTranslatedAlert(t, {
          titleKey: 'scan.alert.productNotFoundTitle',
          titleFallback: 'Product Not Found',
          messageKey: 'scan.alert.productNotFoundMessage',
          messageFallback: 'This barcode is not registered.\nWould you like to analyze the label with a photo?',
          buttons: [
            {
              textKey: 'common.cancel',
              textFallback: 'Cancel',
              style: 'cancel',
              onPress: () => {
                setScanned(false);
                isProcessingRef.current = false;
                setConsecutiveScans(0);
              },
            },
            {
              textKey: 'scan.alert.takePhoto',
              textFallback: 'Take Photo',
              onPress: () => {
                setMode('LABEL');
                setScanned(false);
                isProcessingRef.current = false;
                setConsecutiveScans(0);
              },
            },
          ],
        });
      } catch (error) {
        showTranslatedAlert(t, {
          titleKey: 'camera.alert.errorTitle',
          titleFallback: 'Error',
          messageKey: 'scan.alert.barcodeLookupFailed',
          messageFallback: 'There was a problem looking up the barcode.',
        });
        resetState();
      }
    },
    [
      cachedLocation,
      isConnectedRef,
      isProcessingRef,
      replace,
      resetState,
      setActiveStep,
      setIsAnalyzing,
      setMode,
      setScanned,
      t,
    ]
  );

  const handleBarcodeScanned = useCallback(
    (scanningResult: BarcodeScanningResult) => {
      if (mode !== 'BARCODE' || scanned || isAnalyzing || isProcessingRef.current) return;
      if (!isBarcodeInCenteredRoi(scanningResult, 280)) return;

      const confidence = evaluateScanConfidence({
        currentData: scanningResult.data,
        lastData: lastScannedData.current,
        consecutiveScans,
        requiredMatches: 3,
      });

      lastScannedData.current = confidence.nextLastData;
      setConsecutiveScans(confidence.nextCount);

      if (confidence.action === 'accept') {
        isProcessingRef.current = true;
        setScanned(true);
        void processBarcode(scanningResult.data);
      }
    },
    [
      consecutiveScans,
      isAnalyzing,
      isProcessingRef,
      mode,
      processBarcode,
      scanned,
      setScanned,
    ]
  );

  return { handleBarcodeScanned };
};
