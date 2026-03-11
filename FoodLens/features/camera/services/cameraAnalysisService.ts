import { MutableRefObject } from 'react';
import { analyzeImage } from '../../../services/ai';
import {
  assertAnalysisImageFileReady,
  createAnalysisUploadProgressHandler,
  resolveAnalysisLocation,
  showOfflineAlertAndReset,
} from '../../../services/analysis/flow';
import { dataStore } from '../../../services/dataStore';
import { saveImagePermanentlyOrThrow } from '../../../services/imageStorage';
import { getLocationData, normalizeTimestamp } from '../../../services/utils';
import { LocationContext } from '../types/camera.types';
import { createFallbackLocation } from '../utils/cameraMappers';
import { resolveIsoCodeFromContext } from '../utils/cameraGatewayHelpers';
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
  return resolveAnalysisLocation<LocationContext>({
    initialLocation: cachedLocation.current,
    shouldLoad: (location) => location === undefined,
    loadLocation: async () => getLocationData(),
    onError: (error) => {
      logger.warn('Location fetch failed, defaulting to US context', error, 'CameraAnalysis');
    },
  });
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
    showOfflineAlertAndReset({
      isConnected: isConnectedRef.current,
      title: offlineAlertTitle,
      message: offlineAlertMessage,
      resetState,
      onExit,
    })
  ) {
    return;
  }

  const isoCode = await resolveIsoCodeFromContext(locationData);
  await assertAnalysisImageFileReady(uri);

  setActiveStep(1);
  setUploadProgress(0);

  const analysisResult = await analyzeImage(
    uri,
    isoCode,
    createAnalysisUploadProgressHandler({ isCancelled, setUploadProgress, setActiveStep })
  );

  if (isCancelled.current) return;

  setActiveStep(3);

  const locationContext =
    locationData || createFallbackLocation(0, 0, isoCode, 'Location Unavailable (Using Preference)');
  const finalTimestamp = normalizeTimestamp(photoTimestamp);
  let persistedImageRef = uri;
  try {
    persistedImageRef = await saveImagePermanentlyOrThrow(
      uri,
      'STORAGE_ERROR: Failed to save image permanently. Check disk space.'
    );
  } catch (error) {
    logger.warn('Failed to persist camera image; fallback to original URI', error, 'CameraAnalysis');
  }

  dataStore.setData(analysisResult, locationContext, persistedImageRef, finalTimestamp);
  onSuccess();
  resetState();
};
