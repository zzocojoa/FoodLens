import { resumeAnalysisFlow, runAnalysisFlow } from '../scanCameraAnalysisService';
import {
  assertAnalysisImageFileReady,
  resolveAnalysisLocation,
  showOfflineAlertAndReset,
} from '../../../../services/analysis/flow';
import {
  isAsyncAnalyzeEnabled,
  resumePendingAnalysisJob,
  runAsyncAnalysisJob,
  type AnalysisJobStatus,
  type PendingAnalysisJob,
} from '../../../../services/ai';
import { persistAndNavigateAnalysisResult } from '../../utils/scanCameraGatewayHelpers';
import { resolveRequestIsoCountryCode } from '@/services/aiCore/internal/requestLocale';
import { logger } from '@/services/logger';
import type { LocationData } from '../../../../services/utils/types';

jest.mock('../../utils/scanCameraGatewayHelpers', () => {
  return {
    beginAnalysis: jest.fn(({ uri, setIsAnalyzing, setCapturedImage, setActiveStep }) => {
      setIsAnalyzing(true);
      setCapturedImage(uri);
      setActiveStep(0);
    }),
    getIsoCode: jest.fn((locationData, fallback) => {
      return locationData?.isoCountryCode || fallback || 'US';
    }),
    persistAndNavigateAnalysisResult: jest.fn(async ({ router }) => {
      router.replace('/result');
    }),
  };
});

jest.mock('../../../../services/analysis/flow', () => ({
  assertAnalysisImageFileReady: jest.fn(async () => undefined),
  resolveAnalysisLocation: jest.fn(async ({ initialLocation }) => initialLocation ?? null),
  showOfflineAlertAndReset: jest.fn(() => false),
  createAnalysisUploadProgressHandler: jest.fn(
    ({
      isCancelled,
      setUploadProgress,
      setActiveStep,
    }: {
      isCancelled: { current: boolean };
      setUploadProgress: (value: number | undefined) => void;
      setActiveStep: (value: number | undefined) => void;
    }) => {
      return (progress: number) => {
        if (isCancelled.current) {
          return;
        }

        setUploadProgress(progress);
        if (progress >= 1) {
          setActiveStep(2);
        }
      };
    }
  ),
  applyAnalysisJobStageToHud: jest.fn(
    ({
      status,
      setActiveStep,
      setUploadProgress,
    }: {
      status: AnalysisJobStatus;
      setActiveStep: (value: number | undefined) => void;
      setUploadProgress: (value: number | undefined) => void;
    }) => {
      const stepByStatus: Record<AnalysisJobStatus, number> = {
        queued: 2,
        preprocessing: 3,
        inference: 4,
        nutrition: 5,
        finalizing: 6,
        completed: 6,
        fallback_completed: 6,
        failed: 6,
      };

      setUploadProgress(1);
      setActiveStep(stepByStatus[status]);
    }
  ),
}));

jest.mock('../../../../services/ai', () => ({
  isAsyncAnalyzeEnabled: jest.fn(),
  resumePendingAnalysisJob: jest.fn(),
  runAsyncAnalysisJob: jest.fn(),
}));

jest.mock('@/services/aiCore/internal/requestLocale', () => ({
  resolveRequestIsoCountryCode: jest.fn(),
}));

jest.mock('@/services/logger', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockedAssertAnalysisImageFileReady =
  assertAnalysisImageFileReady as jest.MockedFunction<typeof assertAnalysisImageFileReady>;
const mockedResolveAnalysisLocation =
  resolveAnalysisLocation as jest.MockedFunction<typeof resolveAnalysisLocation>;
const mockedShowOfflineAlertAndReset =
  showOfflineAlertAndReset as jest.MockedFunction<typeof showOfflineAlertAndReset>;
const mockedIsAsyncAnalyzeEnabled = isAsyncAnalyzeEnabled as jest.MockedFunction<
  typeof isAsyncAnalyzeEnabled
>;
const mockedRunAsyncAnalysisJob = runAsyncAnalysisJob as jest.MockedFunction<typeof runAsyncAnalysisJob>;
const mockedResumePendingAnalysisJob = resumePendingAnalysisJob as jest.MockedFunction<
  typeof resumePendingAnalysisJob
>;
const mockedPersistAndNavigateAnalysisResult =
  persistAndNavigateAnalysisResult as jest.MockedFunction<typeof persistAndNavigateAnalysisResult>;
const mockedResolveRequestIsoCountryCode = resolveRequestIsoCountryCode as jest.MockedFunction<
  typeof resolveRequestIsoCountryCode
>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

type Harness = {
  setIsAnalyzing: jest.Mock;
  setCapturedImage: jest.Mock;
  setActiveStep: jest.Mock;
  setUploadProgress: jest.Mock;
  replace: jest.Mock;
  resetState: jest.Mock;
  handleError: jest.Mock;
  isCancelled: { current: boolean };
  isConnectedRef: { current: boolean };
  cachedLocation: { current: LocationData | null | undefined };
};

const createHarness = (): Harness => {
  const resetState = jest.fn();
  const handleError = jest.fn(() => {
    resetState();
  });

  return {
    setIsAnalyzing: jest.fn(),
    setCapturedImage: jest.fn(),
    setActiveStep: jest.fn(),
    setUploadProgress: jest.fn(),
    replace: jest.fn(),
    resetState,
    handleError,
    isCancelled: { current: false },
    isConnectedRef: { current: true },
    cachedLocation: { current: null },
  };
};

const createPendingJob = (): PendingAnalysisJob =>
  ({
    jobId: 'job_resume',
    requestId: 'req_resume',
    flow: 'scan',
    mode: 'food',
    status: 'queued',
    imageUri: 'file://resume.jpg',
    isoCountryCode: 'KR',
    location: null,
    timestamp: '2026-03-17T00:00:00Z',
    sourceType: 'camera',
    submittedAt: '2026-03-17T00:00:00Z',
  }) as PendingAnalysisJob;

describe('scanCameraAnalysisService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedIsAsyncAnalyzeEnabled.mockReturnValue(true);
    mockedResolveAnalysisLocation.mockResolvedValue(null);
    mockedAssertAnalysisImageFileReady.mockResolvedValue(undefined);
    mockedResolveRequestIsoCountryCode.mockResolvedValue('US');
    mockedLogger.warn.mockImplementation(() => undefined);
  });

  it('unwinds FOOD async analysis when polling times out', async () => {
    const harness = createHarness();
    const timeoutError = new Error(
      '[AI Job] polling timed out job_id=job_food_timeout request_id=req_food_timeout submitted_at=2026-03-17T00:00:00Z updated_at=2026-03-17T00:00:00Z elapsed_ms=180000'
    );
    mockedRunAsyncAnalysisJob.mockRejectedValueOnce(timeoutError);

    await runAnalysisFlow({
      uri: 'file://food.jpg',
      sourceType: 'camera',
      timestamp: '2026-03-17T00:00:00Z',
      customLocation: null,
      fallbackAddress: 'Location Unavailable',
      offlineAlertTitle: 'Offline',
      offlineAlertMessage: 'Please check your internet connection.',
      needsFileValidation: true,
      analyzer: jest.fn(),
      analysisMode: 'food',
      isCancelled: harness.isCancelled,
      isConnectedRef: harness.isConnectedRef,
      cachedLocation: harness.cachedLocation,
      setIsAnalyzing: harness.setIsAnalyzing,
      setCapturedImage: harness.setCapturedImage,
      setActiveStep: harness.setActiveStep,
      setUploadProgress: harness.setUploadProgress,
      replace: harness.replace,
      resetState: harness.resetState,
      handleError: harness.handleError,
    });

    expect(harness.setIsAnalyzing).toHaveBeenCalledWith(true);
    expect(harness.setCapturedImage).toHaveBeenCalledWith('file://food.jpg');
    expect(harness.setActiveStep).toHaveBeenCalledWith(0);
    expect(harness.setActiveStep).toHaveBeenCalledWith(1);
    expect(harness.setUploadProgress).toHaveBeenCalledWith(0);
    expect(mockedRunAsyncAnalysisJob).toHaveBeenCalledTimes(1);
    expect(harness.handleError).toHaveBeenCalledWith(timeoutError);
    expect(harness.resetState).toHaveBeenCalledTimes(1);
    expect(harness.replace).not.toHaveBeenCalled();
    expect(mockedPersistAndNavigateAnalysisResult).not.toHaveBeenCalled();
  });

  it('keeps scan idle while offline and does not start analysis', async () => {
    const harness = createHarness();
    harness.isConnectedRef.current = false;
    mockedShowOfflineAlertAndReset.mockImplementationOnce(({ resetState }) => {
      resetState();
      return true;
    });

    await runAnalysisFlow({
      uri: 'file://offline.jpg',
      sourceType: 'camera',
      timestamp: '2026-03-17T00:00:00Z',
      customLocation: null,
      fallbackAddress: 'Location Unavailable',
      offlineAlertTitle: 'Offline',
      offlineAlertMessage: 'Please check your internet connection.',
      needsFileValidation: true,
      analyzer: jest.fn(),
      analysisMode: 'food',
      isCancelled: harness.isCancelled,
      isConnectedRef: harness.isConnectedRef,
      cachedLocation: harness.cachedLocation,
      setIsAnalyzing: harness.setIsAnalyzing,
      setCapturedImage: harness.setCapturedImage,
      setActiveStep: harness.setActiveStep,
      setUploadProgress: harness.setUploadProgress,
      replace: harness.replace,
      resetState: harness.resetState,
      handleError: harness.handleError,
    });

    expect(mockedShowOfflineAlertAndReset).toHaveBeenCalledWith(
      expect.objectContaining({
        isConnected: false,
        title: 'Offline',
        message: 'Please check your internet connection.',
        resetState: harness.resetState,
      })
    );
    expect(harness.resetState).toHaveBeenCalledTimes(1);
    expect(harness.setIsAnalyzing).not.toHaveBeenCalled();
    expect(mockedResolveAnalysisLocation).not.toHaveBeenCalled();
    expect(mockedAssertAnalysisImageFileReady).not.toHaveBeenCalled();
    expect(mockedRunAsyncAnalysisJob).not.toHaveBeenCalled();
    expect(harness.handleError).not.toHaveBeenCalled();
    expect(harness.replace).not.toHaveBeenCalled();
    expect(mockedPersistAndNavigateAnalysisResult).not.toHaveBeenCalled();
  });

  it('unwinds LABEL async analysis when polling becomes stale', async () => {
    const harness = createHarness();
    const staleError = new Error(
      '[AI Job] polling became stale job_id=job_label_stale request_id=req_label_stale submitted_at=2026-03-17T00:00:00Z updated_at=2026-03-17T00:00:00Z elapsed_ms=90001'
    );
    mockedRunAsyncAnalysisJob.mockRejectedValueOnce(staleError);

    await runAnalysisFlow({
      uri: 'file://label.jpg',
      sourceType: 'library',
      timestamp: '2026-03-17T00:00:00Z',
      customLocation: null,
      fallbackAddress: 'Location Unavailable',
      offlineAlertTitle: 'Offline',
      offlineAlertMessage: 'Please check your internet connection.',
      needsFileValidation: true,
      analyzer: jest.fn(),
      analysisMode: 'label',
      isCancelled: harness.isCancelled,
      isConnectedRef: harness.isConnectedRef,
      cachedLocation: harness.cachedLocation,
      setIsAnalyzing: harness.setIsAnalyzing,
      setCapturedImage: harness.setCapturedImage,
      setActiveStep: harness.setActiveStep,
      setUploadProgress: harness.setUploadProgress,
      replace: harness.replace,
      resetState: harness.resetState,
      handleError: harness.handleError,
    });

    expect(mockedRunAsyncAnalysisJob).toHaveBeenCalledTimes(1);
    expect(mockedRunAsyncAnalysisJob).toHaveBeenCalledWith(
      expect.objectContaining({
        flow: 'scan',
        mode: 'label',
        imageUri: 'file://label.jpg',
        sourceType: 'library',
      })
    );
    expect(harness.handleError).toHaveBeenCalledWith(staleError);
    expect(harness.resetState).toHaveBeenCalledTimes(1);
    expect(harness.replace).not.toHaveBeenCalled();
    expect(mockedPersistAndNavigateAnalysisResult).not.toHaveBeenCalled();
  });

  it('unwinds a resumed scan job when polling becomes stale', async () => {
    const harness = createHarness();
    const staleError = new Error(
      '[AI Job] polling became stale job_id=job_resume request_id=req_resume submitted_at=2026-03-17T00:00:00Z updated_at=2026-03-17T00:00:00Z elapsed_ms=90001'
    );
    mockedResumePendingAnalysisJob.mockRejectedValueOnce(staleError);

    await resumeAnalysisFlow({
      pendingJob: createPendingJob(),
      isCancelled: harness.isCancelled,
      setIsAnalyzing: harness.setIsAnalyzing,
      setCapturedImage: harness.setCapturedImage,
      setActiveStep: harness.setActiveStep,
      setUploadProgress: harness.setUploadProgress,
      replace: harness.replace,
      resetState: harness.resetState,
      handleError: harness.handleError,
    });

    expect(harness.setIsAnalyzing).toHaveBeenCalledWith(true);
    expect(harness.setCapturedImage).toHaveBeenCalledWith('file://resume.jpg');
    expect(harness.setActiveStep).toHaveBeenCalledWith(2);
    expect(harness.setUploadProgress).toHaveBeenCalledWith(1);
    expect(mockedResumePendingAnalysisJob).toHaveBeenCalledTimes(1);
    expect(harness.handleError).toHaveBeenCalledWith(staleError);
    expect(harness.resetState).toHaveBeenCalledTimes(1);
    expect(harness.replace).not.toHaveBeenCalled();
    expect(mockedPersistAndNavigateAnalysisResult).not.toHaveBeenCalled();
  });

  it('resets state and navigates after a successful FOOD analysis', async () => {
    const harness = createHarness();
    mockedRunAsyncAnalysisJob.mockResolvedValueOnce({
      foodName: 'Bibimbap',
      request_id: 'req_success',
    } as unknown as Awaited<ReturnType<typeof runAsyncAnalysisJob>>);

    await runAnalysisFlow({
      uri: 'file://success.jpg',
      sourceType: 'camera',
      timestamp: '2026-03-17T00:00:00Z',
      customLocation: null,
      fallbackAddress: 'Location Unavailable',
      offlineAlertTitle: 'Offline',
      offlineAlertMessage: 'Please check your internet connection.',
      needsFileValidation: true,
      analyzer: jest.fn(),
      analysisMode: 'food',
      isCancelled: harness.isCancelled,
      isConnectedRef: harness.isConnectedRef,
      cachedLocation: harness.cachedLocation,
      setIsAnalyzing: harness.setIsAnalyzing,
      setCapturedImage: harness.setCapturedImage,
      setActiveStep: harness.setActiveStep,
      setUploadProgress: harness.setUploadProgress,
      replace: harness.replace,
      resetState: harness.resetState,
      handleError: harness.handleError,
    });

    expect(mockedRunAsyncAnalysisJob).toHaveBeenCalledTimes(1);
    expect(mockedPersistAndNavigateAnalysisResult).toHaveBeenCalledTimes(1);
    expect(harness.replace).toHaveBeenCalledWith('/result');
    expect(harness.resetState).toHaveBeenCalledTimes(1);
    expect(harness.handleError).not.toHaveBeenCalled();
    expect(harness.setActiveStep).toHaveBeenLastCalledWith(3);
  });
});
