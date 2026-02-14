import { MutableRefObject } from 'react';
import { Href } from 'expo-router';
import { AnalyzedData } from '../../../services/ai';
import { getLocationData } from '../../../services/utils';
import { LocationData } from '../../../services/utils/types';
import {
  assertImageFileReady,
  beginAnalysis,
  createProgressHandler,
  getIsoCode,
  persistAndNavigateAnalysisResult,
} from '../utils/scanCameraGatewayHelpers';
import { showAlert } from '@/services/ui/uiAlerts';
import { logger } from '@/services/logger';

type AnalysisExecutor = (
  uri: string,
  isoCode: string,
  onProgress: (progress: number) => void
) => Promise<AnalyzedData>;

type RunAnalysisFlowParams = {
  uri: string;
  sourceType?: 'camera' | 'library';
  timestamp?: string | null;
  customLocation?: LocationData | null;
  fallbackAddress?: string;
  offlineAlertTitle: string;
  offlineAlertMessage: string;
  needsFileValidation?: boolean;
  analyzer: AnalysisExecutor;
  isCancelled: MutableRefObject<boolean>;
  isConnectedRef: MutableRefObject<boolean>;
  cachedLocation: MutableRefObject<LocationData | null | undefined>;
  setIsAnalyzing: (value: boolean) => void;
  setCapturedImage: (value: string | null) => void;
  setActiveStep: (value: number | undefined) => void;
  setUploadProgress: (value: number | undefined) => void;
  replace: (route: Href) => void;
  resetState: () => void;
  handleError: (error: unknown) => void;
};

const resolveLocationForAnalysis = async ({
  customLocation,
  cachedLocation,
}: Pick<RunAnalysisFlowParams, 'customLocation' | 'cachedLocation'>) => {
  let locationData = customLocation ?? cachedLocation.current ?? null;

  if (!locationData) {
    try {
      locationData = await getLocationData();
      if (locationData) cachedLocation.current = locationData;
    } catch (error) {
      logger.warn('Location fetch failed', error, 'ScanAnalysis');
    }
  }

  return locationData;
};

const isOfflineAndReset = ({
  isConnectedRef,
  offlineAlertTitle,
  offlineAlertMessage,
  resetState,
}: Pick<
  RunAnalysisFlowParams,
  'isConnectedRef' | 'offlineAlertTitle' | 'offlineAlertMessage' | 'resetState'
>) => {
  if (isConnectedRef.current) return false;
  showAlert(offlineAlertTitle, offlineAlertMessage);
  resetState();
  return true;
};

export const runAnalysisFlow = async ({
  uri,
  sourceType,
  timestamp,
  customLocation,
  fallbackAddress,
  offlineAlertTitle,
  offlineAlertMessage,
  needsFileValidation = true,
  analyzer,
  isCancelled,
  isConnectedRef,
  cachedLocation,
  setIsAnalyzing,
  setCapturedImage,
  setActiveStep,
  setUploadProgress,
  replace,
  resetState,
  handleError,
}: RunAnalysisFlowParams) => {
  try {
    isCancelled.current = false;
    beginAnalysis({ uri, setIsAnalyzing, setCapturedImage, setActiveStep });

    const locationData = await resolveLocationForAnalysis({
      customLocation,
      cachedLocation,
    });

    if (isCancelled.current) return;

    if (
      isOfflineAndReset({
        isConnectedRef,
        offlineAlertTitle,
        offlineAlertMessage,
        resetState,
      })
    ) {
      return;
    }

    const isoCode = getIsoCode(locationData, 'US');

    if (needsFileValidation) {
      await assertImageFileReady(uri);
    }

    setActiveStep(1);
    setUploadProgress(0);

    const analysisResult = await analyzer(
      uri,
      isoCode,
      createProgressHandler({ isCancelled, setUploadProgress: (value: number) => setUploadProgress(value), setActiveStep: (value: number) => setActiveStep(value) })
    );

    if (isCancelled.current) return;

    setActiveStep(3);
    await persistAndNavigateAnalysisResult({
      analysisResult,
      locationData,
      isoCode,
      timestamp,
      imageUri: uri,
      fallbackAddress,
      sourceType,
      router: { replace },
    });

    resetState();
  } catch (error) {
    if (isCancelled.current) return;
    handleError(error);
  }
};
