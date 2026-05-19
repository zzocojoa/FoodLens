import { MutableRefObject, useCallback, useRef, useState } from 'react';
import { BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { Href } from 'expo-router';
import { lookupBarcodeWithCache, normalizeBarcodeIngredients } from '../services/scanCameraBarcodeService';
import { isBarcodeInCenteredRoi, evaluateScanConfidence } from '../utils/barcodeScannerUtils';
import { createFallbackLocation } from '../utils/scanCameraMappers';
import { dataStore } from '@/services/dataStore';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { buildResultRoute } from '@/services/contracts/resultRoute';
import { LocationData } from '@/services/utils/types';
import { AnalyzedData } from '@/services/ai';
import { resolveRequestIsoCountryCode } from '@/services/aiCore/internal/requestLocale';
import type { AnalysisOrigin } from '@/services/aiCore/types';

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
  setPendingAnalysisOrigin: (analysisOrigin: AnalysisOrigin | null) => void;
  t: Translate;
};

const getRawImageUrl = (product: { raw_data?: Record<string, unknown> }): string | null => {
  const candidate = product.raw_data?.['image_url'];
  return typeof candidate === 'string' ? candidate : null;
};

const BARCODE_ACCEPT_DEDUP_WINDOW_MS = 6_000;

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
  setPendingAnalysisOrigin,
  t,
}: UseScanBarcodeFlowParams) => {
  const [consecutiveScans, setConsecutiveScans] = useState(0);
  const lastScannedData = useRef<string | null>(null);
  const lastAcceptedBarcodeRef = useRef<{ value: string; at: number } | null>(null);

  const processBarcode = useCallback(
    async (barcode: string) => {
      try {
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

        setIsAnalyzing(true);
        setActiveStep(0);

        const result = await lookupBarcodeWithCache(barcode);

        if (result.found && result.data) {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          const product = normalizeBarcodeIngredients(result.data) as AnalyzedData & {
            raw_data?: Record<string, unknown>;
          };
          product.raw_data = {
            ...(product.raw_data || {}),
            scanned_barcode: barcode,
          };

          let fallbackIsoCode = 'US';
          try {
            fallbackIsoCode = await resolveRequestIsoCountryCode();
          } catch (error) {
            console.warn('[ScanBarcode] Failed to resolve request ISO country code, fallback to US.', error);
          }
          const locationData =
            cachedLocation.current || createFallbackLocation(0, 0, fallbackIsoCode);
          const finalTimestamp = new Date().toISOString();

          dataStore.setData(product, locationData, getRawImageUrl(product) || '', finalTimestamp);
          setPendingAnalysisOrigin(null);
          replace(
            buildResultRoute({
              isNew: true,
              isBarcode: true,
              analysisOrigin: product.analysisOrigin,
              sourceType: 'camera',
            })
          );
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
                setPendingAnalysisOrigin(null);
                setScanned(false);
                isProcessingRef.current = false;
                setConsecutiveScans(0);
              },
            },
            {
              textKey: 'scan.alert.takePhoto',
              textFallback: 'Take Photo',
              onPress: () => {
                setPendingAnalysisOrigin('barcode_to_label_fallback');
                setMode('LABEL');
                setScanned(false);
                isProcessingRef.current = false;
                setConsecutiveScans(0);
              },
            },
          ],
        });
      } catch {
        setPendingAnalysisOrigin(null);
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
      setPendingAnalysisOrigin,
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
        const now = Date.now();
        const lastAccepted = lastAcceptedBarcodeRef.current;
        if (
          lastAccepted &&
          lastAccepted.value === scanningResult.data &&
          now - lastAccepted.at < BARCODE_ACCEPT_DEDUP_WINDOW_MS
        ) {
          return;
        }
        lastAcceptedBarcodeRef.current = {
          value: scanningResult.data,
          at: now,
        };
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
