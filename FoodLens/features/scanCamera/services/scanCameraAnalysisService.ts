import { MutableRefObject } from 'react';
import { Href } from 'expo-router';
import {
    AnalyzedData,
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
import { getLocationData } from '../../../services/utils';
import { LocationData } from '../../../services/utils/types';
import {
  beginAnalysis,
  getIsoCode,
  persistAndNavigateAnalysisResult,
} from '../utils/scanCameraGatewayHelpers';
import { logger } from '@/services/logger';
import { resolveRequestIsoCountryCode } from '@/services/aiCore/internal/requestLocale';

type AnalysisExecutor = (
  uri: string,
  isoCode: string,
  onProgress: (progress: number) => void
) => Promise<AnalyzedData>;

type AnalysisMode = 'food' | 'label' | 'smart';

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
  analysisMode: AnalysisMode;
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

type ResumeAnalysisFlowParams = Pick<
  RunAnalysisFlowParams,
  'isCancelled' | 'setIsAnalyzing' | 'setCapturedImage' | 'setActiveStep' | 'setUploadProgress' | 'replace' | 'resetState' | 'handleError'
> & {
  pendingJob: PendingAnalysisJob;
};

const resolveLocationForAnalysis = async ({
  customLocation,
  cachedLocation,
}: Pick<RunAnalysisFlowParams, 'customLocation' | 'cachedLocation'>): Promise<LocationData | null> => {
  const location = await resolveAnalysisLocation<LocationData>({
    initialLocation: customLocation ?? cachedLocation.current ?? null,
    shouldLoad: (location) => !location,
    loadLocation: async () => getLocationData(),
    onLoaded: (location) => {
      if (location) {
        cachedLocation.current = location;
      }
    },
    onError: (error) => {
      logger.warn('Location fetch failed', error, 'ScanAnalysis');
    },
  });
  return location ?? null;
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
  analysisMode,
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
      showOfflineAlertAndReset({
        isConnected: isConnectedRef.current,
        title: offlineAlertTitle,
        message: offlineAlertMessage,
        resetState,
      })
    ) {
      return;
    }

    let fallbackIsoCode = 'US';
    try {
      fallbackIsoCode = await resolveRequestIsoCountryCode();
    } catch (error) {
      logger.warn('Failed to resolve request ISO country code, fallback to US', error, 'ScanAnalysis');
    }
    const isoCode = getIsoCode(locationData, fallbackIsoCode);

    if (needsFileValidation) {
      await assertAnalysisImageFileReady(uri);
    }

    setActiveStep(1);
    setUploadProgress(0);

    const progressHandler = createAnalysisUploadProgressHandler({
      isCancelled,
      setUploadProgress,
      setActiveStep,
    });
    const analysisResult = isAsyncAnalyzeEnabled()
      ? await runAsyncAnalysisJob({
          flow: 'scan',
          mode: analysisMode,
          imageUri: uri,
          isoCountryCode: isoCode,
          location: locationData,
          timestamp: timestamp ?? null,
          sourceType: sourceType || 'camera',
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
      : await analyzer(uri, isoCode, progressHandler);

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

export const resumeAnalysisFlow = async ({
  pendingJob,
  isCancelled,
  setIsAnalyzing,
  setCapturedImage,
  setActiveStep,
  setUploadProgress,
  replace,
  resetState,
  handleError,
}: ResumeAnalysisFlowParams) => {
  try {
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

    setActiveStep(6);
    await persistAndNavigateAnalysisResult({
      analysisResult,
      locationData: (pendingJob.location as LocationData | null) || null,
      isoCode: pendingJob.isoCountryCode,
      timestamp: pendingJob.timestamp,
      imageUri: pendingJob.imageUri,
      fallbackAddress: 'Location Unavailable',
      sourceType: pendingJob.sourceType,
      router: { replace },
    });

    resetState();
  } catch (error) {
    if (isCancelled.current) return;
    handleError(error);
  }
};
