import { Alert } from 'react-native';
import { MutableRefObject } from 'react';
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

type AnalysisExecutor = (
  uri: string,
  isoCode: string,
  onProgress: (progress: number) => void
) => Promise<AnalyzedData>;

type RunAnalysisFlowParams = {
  uri: string;
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
  replace: (route: any) => void;
  resetState: () => void;
  handleError: (error: any) => void;
};

export const runAnalysisFlow = async ({
  uri,
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
    beginAnalysis({ uri, setIsAnalyzing, setCapturedImage, setActiveStep: setActiveStep as (value: number) => void });

    let locationData = customLocation ?? cachedLocation.current ?? null;
    if (!locationData) {
      try {
        locationData = await getLocationData();
        if (locationData) cachedLocation.current = locationData;
      } catch (error) {
        console.warn('Location fetch failed', error);
      }
    }

    if (isCancelled.current) return;

    if (!isConnectedRef.current) {
      Alert.alert(offlineAlertTitle, offlineAlertMessage);
      resetState();
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
      createProgressHandler({ isCancelled, setUploadProgress: setUploadProgress as (value: number) => void, setActiveStep: setActiveStep as (value: number) => void })
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
      router: { replace },
    });

    resetState();
  } catch (error: any) {
    if (isCancelled.current) return;
    handleError(error);
  }
};
