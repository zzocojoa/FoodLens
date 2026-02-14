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
import { showAlert } from '@/services/ui/uiAlerts';
import { logger } from '@/services/logger';

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

const beginCameraAnalysis = ({
  uri,
  isCancelled,
  setIsAnalyzing,
  setCapturedImage,
  setActiveStep,
}: {
  uri: string;
  isCancelled: MutableRefObject<boolean>;
  setIsAnalyzing: (value: boolean) => void;
  setCapturedImage: (value: string | null) => void;
  setActiveStep: (value: number | undefined) => void;
}) => {
  isCancelled.current = false;
  setIsAnalyzing(true);
  setCapturedImage(uri);
  setActiveStep(0);
};

const resolveLocationContext = async (
  cachedLocation: MutableRefObject<LocationContext | null | undefined>
) => {
  let locationData = cachedLocation.current;

  if (locationData === undefined) {
    try {
      locationData = await getLocationData();
    } catch (error) {
      logger.warn('Location fetch failed, defaulting to US context', error, 'CameraAnalysis');
    }
  }

  return locationData;
};

const createUploadProgressHandler = ({
  isCancelled,
  setUploadProgress,
  setActiveStep,
}: {
  isCancelled: MutableRefObject<boolean>;
  setUploadProgress: (value: number | undefined) => void;
  setActiveStep: (value: number | undefined) => void;
}) => {
  return (progress: number) => {
    if (isCancelled.current) return;
    setUploadProgress(progress);
    if (progress >= 1) {
      setActiveStep(2);
    }
  };
};

const handleOfflineCase = ({
  isConnectedRef,
  offlineAlertTitle,
  offlineAlertMessage,
  resetState,
  onExit,
}: {
  isConnectedRef: MutableRefObject<boolean>;
  offlineAlertTitle: string;
  offlineAlertMessage: string;
  resetState: () => void;
  onExit: () => void;
}) => {
  if (isConnectedRef.current) return false;
  showAlert(offlineAlertTitle, offlineAlertMessage);
  resetState();
  onExit();
  return true;
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
  beginCameraAnalysis({
    uri,
    isCancelled,
    setIsAnalyzing,
    setCapturedImage,
    setActiveStep,
  });

  const locationData = await resolveLocationContext(cachedLocation);

  if (isCancelled.current) return;

  if (
    handleOfflineCase({
      isConnectedRef,
      offlineAlertTitle,
      offlineAlertMessage,
      resetState,
      onExit,
    })
  ) {
    return;
  }

  const isoCode = await resolveIsoCodeFromContext(locationData);
  await assertImageFileReady(uri);

  setActiveStep(1);
  setUploadProgress(0);

  const analysisResult = await analyzeImage(
    uri,
    isoCode,
    createUploadProgressHandler({ isCancelled, setUploadProgress, setActiveStep })
  );

  if (isCancelled.current) return;

  setActiveStep(3);

  const locationContext =
    locationData || createFallbackLocation(0, 0, isoCode, 'Location Unavailable (Using Preference)');
  const finalTimestamp = normalizeTimestamp(photoTimestamp);

  dataStore.setData(analysisResult, locationContext, uri, finalTimestamp);
  onSuccess();
  resetState();
};
