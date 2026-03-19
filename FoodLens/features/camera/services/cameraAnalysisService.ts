import { MutableRefObject } from 'react';
import {
  analyzeImage,
  isAsyncAnalyzeEnabled,
  PendingAnalysisJob,
  resumePendingAnalysisJob,
  runAsyncAnalysisJob,
} from '../../../services/ai';
import {
  applyAnalysisJobStageToHud,
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

type ResumeCameraImageAnalysisParams = Omit<
  RunCameraImageAnalysisParams,
  'uri' | 'photoTimestamp' | 'cachedLocation' | 'isConnectedRef' | 'offlineAlertTitle' | 'offlineAlertMessage' | 'onExit'
> & {
  pendingJob: PendingAnalysisJob;
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

  const progressHandler = createAnalysisUploadProgressHandler({
    isCancelled,
    setUploadProgress,
    setActiveStep,
  });
  const analysisResult = isAsyncAnalyzeEnabled()
    ? await runAsyncAnalysisJob({
        flow: 'camera',
        mode: 'food',
        imageUri: uri,
        isoCountryCode: isoCode,
        location: locationData ?? null,
        timestamp: normalizeTimestamp(photoTimestamp),
        sourceType: 'camera',
        onUploadProgress: progressHandler,
        onStageChange: (status) => {
          if (isCancelled.current) return;
          applyAnalysisJobStageToHud({
            status,
            setActiveStep,
            setUploadProgress,
          });
        },
        isCancelled,
      })
    : await analyzeImage(uri, isoCode, progressHandler);

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

export const resumeCameraImageAnalysis = async ({
  pendingJob,
  isCancelled,
  setIsAnalyzing,
  setCapturedImage,
  setActiveStep,
  setUploadProgress,
  resetState,
  onSuccess,
}: ResumeCameraImageAnalysisParams) => {
  isCancelled.current = false;
  setIsAnalyzing(true);
  setCapturedImage(pendingJob.imageUri);
  applyAnalysisJobStageToHud({
    status: pendingJob.status,
    setActiveStep,
    setUploadProgress,
  });

  const analysisResult = await resumePendingAnalysisJob({
    pendingJob,
    onStageChange: (status) => {
      if (isCancelled.current) return;
      applyAnalysisJobStageToHud({
        status,
        setActiveStep,
        setUploadProgress,
      });
    },
    isCancelled,
  });

  if (isCancelled.current) return;

  const locationContext =
    (pendingJob.location as LocationContext | null) ||
    createFallbackLocation(0, 0, pendingJob.isoCountryCode, 'Location Unavailable (Recovered)');
  let persistedImageRef = pendingJob.imageUri;
  try {
    persistedImageRef = await saveImagePermanentlyOrThrow(
      pendingJob.imageUri,
      'STORAGE_ERROR: Failed to save image permanently. Check disk space.'
    );
  } catch (error) {
    logger.warn('Failed to persist resumed camera image; fallback to original URI', error, 'CameraAnalysis');
  }

  dataStore.setData(
    analysisResult,
    locationContext,
    persistedImageRef,
    normalizeTimestamp(pendingJob.timestamp || undefined)
  );
  onSuccess();
  resetState();
};
