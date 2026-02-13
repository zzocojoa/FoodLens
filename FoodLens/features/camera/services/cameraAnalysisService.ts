import { Alert } from 'react-native';
import { MutableRefObject } from 'react';
import { analyzeImage } from '../../../services/ai';
import { dataStore } from '../../../services/dataStore';
import { getLocationData, normalizeTimestamp } from '../../../services/utils';
import { LocationContext } from '../types/camera.types';
import { createFallbackLocation } from '../utils/cameraMappers';
import {
  assertImageFileReady,
  resolveIsoCodeFromContext,
} from '../utils/cameraGatewayHelpers';

type RunCameraImageAnalysisParams = {
  uri: string;
  photoTimestamp?: string;
  cachedLocation: MutableRefObject<LocationContext | null | undefined>;
  isCancelled: MutableRefObject<boolean>;
  isConnectedRef: MutableRefObject<boolean>;
  setIsAnalyzing: (value: boolean) => void;
  setCapturedImage: (value: string | null) => void;
  setActiveStep: (value: number | undefined) => void;
  setUploadProgress: (value: number | undefined) => void;
  resetState: () => void;
  onExit: () => void;
  onSuccess: () => void;
  offlineAlertTitle: string;
  offlineAlertMessage: string;
};

export const runCameraImageAnalysis = async ({
  uri,
  photoTimestamp,
  cachedLocation,
  isCancelled,
  isConnectedRef,
  setIsAnalyzing,
  setCapturedImage,
  setActiveStep,
  setUploadProgress,
  resetState,
  onExit,
  onSuccess,
  offlineAlertTitle,
  offlineAlertMessage,
}: RunCameraImageAnalysisParams) => {
  isCancelled.current = false;
  setIsAnalyzing(true);
  setCapturedImage(uri);
  setActiveStep(0);

  let locationData = cachedLocation.current;

  if (locationData === undefined) {
    try {
      locationData = await getLocationData();
    } catch (error) {
      console.warn('Location fetch failed, defaulting to US context', error);
    }
  }

  if (isCancelled.current) return;

  if (!isConnectedRef.current) {
    Alert.alert(offlineAlertTitle, offlineAlertMessage);
    resetState();
    onExit();
    return;
  }

  const isoCode = await resolveIsoCodeFromContext(locationData);
  await assertImageFileReady(uri);

  setActiveStep(1);
  setUploadProgress(0);

  const analysisResult = await analyzeImage(uri, isoCode, (progress) => {
    if (isCancelled.current) return;
    setUploadProgress(progress);
    if (progress >= 1) {
      setActiveStep(2);
    }
  });

  if (isCancelled.current) return;

  setActiveStep(3);

  const locationContext =
    locationData || createFallbackLocation(0, 0, isoCode, 'Location Unavailable (Using Preference)');
  const finalTimestamp = normalizeTimestamp(photoTimestamp);

  dataStore.setData(analysisResult, locationContext, uri, finalTimestamp);
  onSuccess();
  resetState();
};
