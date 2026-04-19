import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { CameraView } from 'expo-camera';
import { analyzeImage, analyzeLabel, analyzeSmart, loadPendingAnalysisJob } from '@/services/ai';
import { dataStore } from '@/services/dataStore';
import { clearPendingAnalysisJob } from '@/services/aiCore/pendingAnalysisStore';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { useScanCameraGateway } from '../useScanCameraGateway';
import { useScanGalleryFlow } from '../useScanGalleryFlow';
import { runAnalysisFlow } from '../../services/scanCameraAnalysisService';
import type { LocationData } from '@/services/utils/types';

jest.mock('expo-camera', () => ({
  useCameraPermissions: jest.fn(() => [null, jest.fn()]),
}));

jest.mock('expo-haptics', () => ({
  impactAsync: jest.fn(),
  selectionAsync: jest.fn(),
  ImpactFeedbackStyle: {
    Medium: 'medium',
  },
}));

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

jest.mock('@react-navigation/native', () => ({
  useIsFocused: jest.fn(() => true),
}));

jest.mock('../../constants/scanCamera.constants', () => ({
  MODES: [
    { id: 'LABEL', label: 'Label' },
    { id: 'FOOD', label: 'Food' },
    { id: 'BARCODE', label: 'Barcode' },
  ],
}));

jest.mock('../../../../hooks/use-app-navigation', () => ({
  useAppNavigation: jest.fn(() => ({
    replace: jest.fn(),
    back: jest.fn(),
  })),
}));

jest.mock('../../../../hooks/useNetworkStatus', () => ({
  useNetworkStatus: jest.fn(() => ({
    isConnected: true,
  })),
}));

jest.mock('@/features/i18n', () => ({
  useI18n: jest.fn(() => ({
    t: (key: string, fallback?: string) => fallback || key,
  })),
}));

jest.mock('@/services/ui/uiAlerts', () => ({
  showTranslatedAlert: jest.fn(),
}));

jest.mock('../../../../services/aiCore/pendingAnalysisStore', () => ({
  clearPendingAnalysisJob: jest.fn(async () => undefined),
}));

jest.mock('../../../../services/dataStore', () => ({
  dataStore: {
    setPendingAnalysisOrigin: jest.fn(),
    setData: jest.fn(),
  },
}));

jest.mock('../../../../services/ai', () => ({
  analyzeImage: jest.fn(),
  analyzeLabel: jest.fn(),
  analyzeSmart: jest.fn(),
  loadPendingAnalysisJob: jest.fn(async () => null),
}));

jest.mock('../../services/scanCameraAnalysisService', () => ({
  runAnalysisFlow: jest.fn(async () => undefined),
  resumeAnalysisFlow: jest.fn(async () => undefined),
}));

jest.mock('../useScanPermissionFlow', () => ({
  useScanPermissionFlow: jest.fn(() => jest.fn()),
}));

jest.mock('../useScanBarcodeFlow', () => ({
  useScanBarcodeFlow: jest.fn(() => ({
    handleBarcodeScanned: jest.fn(),
  })),
}));

jest.mock('../useScanGalleryFlow', () => ({
  useScanGalleryFlow: jest.fn(() => jest.fn()),
}));

jest.mock('../useScanAnalysisAdGate', () => ({
  useScanAnalysisAdGate: jest.fn(() => ({
    ensureAnalysisAccess: jest.fn(async () => true),
  })),
}));

jest.mock('../useScanCameraLaserAnimation', () => ({
  useScanCameraLaserAnimation: jest.fn(() => 'laser-anim'),
}));

jest.mock('@/services/logger', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

type TimeoutStyleAnalysisErrorCode = 'ANALYSIS_JOB_POLL_TIMEOUT' | 'ANALYSIS_JOB_POLL_STALE';

type RunAnalysisFlowParams = Parameters<typeof runAnalysisFlow>[0];

type DeferredPromise = {
  promise: Promise<void>;
  resolve: () => void;
};

const mockedShowTranslatedAlert =
  showTranslatedAlert as jest.MockedFunction<typeof showTranslatedAlert>;
const mockedClearPendingAnalysisJob =
  clearPendingAnalysisJob as jest.MockedFunction<typeof clearPendingAnalysisJob>;
const mockedLoadPendingAnalysisJob =
  loadPendingAnalysisJob as jest.MockedFunction<typeof loadPendingAnalysisJob>;
const mockedRunAnalysisFlow = runAnalysisFlow as jest.MockedFunction<typeof runAnalysisFlow>;
const mockedAnalyzeImage = analyzeImage as jest.MockedFunction<typeof analyzeImage>;
const mockedAnalyzeLabel = analyzeLabel as jest.MockedFunction<typeof analyzeLabel>;
const mockedAnalyzeSmart = analyzeSmart as jest.MockedFunction<typeof analyzeSmart>;
const mockedUseScanGalleryFlow = useScanGalleryFlow as jest.MockedFunction<typeof useScanGalleryFlow>;
const mockedDataStore = dataStore as unknown as {
  setPendingAnalysisOrigin: jest.Mock;
  setData: jest.Mock;
};

const createPollingError = (code: TimeoutStyleAnalysisErrorCode): Error & { code: TimeoutStyleAnalysisErrorCode } => {
  const error =
    code === 'ANALYSIS_JOB_POLL_TIMEOUT'
      ? new Error('[AI Job] polling timed out job_id=job_1 request_id=req_1')
      : new Error('[AI Job] polling became stale job_id=job_1 request_id=req_1');
  return Object.assign(error, { code });
};

const createDeferredPromise = (): DeferredPromise => {
  let resolvePromise: () => void = () => undefined;
  const promise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: resolvePromise,
  };
};

const createCapturedPhoto = () => ({
  uri: 'file://scan.jpg',
  width: 1600,
  height: 1200,
  exif: {
    DateTimeOriginal: '2026:04:19 12:34:56',
  },
});

describe('useScanCameraGateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    mockedLoadPendingAnalysisJob.mockResolvedValue(null);
    mockedAnalyzeImage.mockResolvedValue({} as never);
    mockedAnalyzeLabel.mockResolvedValue({} as never);
    mockedAnalyzeSmart.mockResolvedValue({} as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it.each<TimeoutStyleAnalysisErrorCode>(['ANALYSIS_JOB_POLL_TIMEOUT', 'ANALYSIS_JOB_POLL_STALE'])(
    'maps %s to the timeout alert and clears scan state',
    async (code) => {
      const capturedPhoto = createCapturedPhoto();
      const takePictureAsync = jest.fn().mockResolvedValue(capturedPhoto);
      const { result } = renderHook(() => useScanCameraGateway());
      const runFlowParams = createPollingError(code);

      result.current.cameraRef.current = {
        takePictureAsync,
      } as unknown as CameraView;

      mockedRunAnalysisFlow.mockImplementationOnce(async (params: unknown) => {
        const flowParams = params as RunAnalysisFlowParams;
        flowParams.setIsAnalyzing(true);
        flowParams.setCapturedImage(capturedPhoto.uri);
        flowParams.setActiveStep(0);
        flowParams.setUploadProgress(0);
        flowParams.handleError(runFlowParams);
      });

      await act(async () => {
        await result.current.handleCapture();
      });

      expect(mockedRunAnalysisFlow).toHaveBeenCalledTimes(1);
      expect(
        mockedRunAnalysisFlow.mock.calls[0]?.[0] as RunAnalysisFlowParams
      ).toEqual(
        expect.objectContaining({
          analysisMode: 'food',
        })
      );
      expect(mockedClearPendingAnalysisJob).toHaveBeenCalledTimes(1);
      expect(mockedShowTranslatedAlert).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          titleKey: 'camera.alert.analysisFailedTitle',
          messageKey: 'scan.alert.analysisTimeout',
        })
      );
      expect(result.current.isAnalyzing).toBe(false);
      expect(result.current.capturedImage).toBeNull();
      expect(result.current.activeStep).toBeUndefined();
      expect(result.current.uploadProgress).toBeUndefined();
    }
  );

  it('clears pending analysis and local scan state when cancelling an active capture', async () => {
    const capturedPhoto = createCapturedPhoto();
    const takePictureAsync = jest.fn().mockResolvedValue(capturedPhoto);
    const deferred = createDeferredPromise();
    const { result } = renderHook(() => useScanCameraGateway());

    result.current.cameraRef.current = {
      takePictureAsync,
    } as unknown as CameraView;

    mockedRunAnalysisFlow.mockImplementationOnce(async (params: unknown) => {
      const flowParams = params as RunAnalysisFlowParams;
      flowParams.setIsAnalyzing(true);
      flowParams.setCapturedImage(capturedPhoto.uri);
      flowParams.setActiveStep(0);
      flowParams.setUploadProgress(0);
      await deferred.promise;
    });

    await act(async () => {
      void result.current.handleCapture();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(result.current.isAnalyzing).toBe(true);
    });

    await act(async () => {
      result.current.handleCancelAnalysis();
      deferred.resolve();
      await Promise.resolve();
    });

    expect(mockedClearPendingAnalysisJob).toHaveBeenCalledTimes(1);
    expect(mockedDataStore.setPendingAnalysisOrigin).toHaveBeenCalledWith(null);
    expect(result.current.isAnalyzing).toBe(false);
    expect(result.current.capturedImage).toBeNull();
    expect(result.current.activeStep).toBeUndefined();
    expect(result.current.uploadProgress).toBeUndefined();
  });

  it('forwards LABEL gallery EXIF location into the async scan flow', async () => {
    const exifLocation: LocationData = {
      latitude: 37.5665,
      longitude: 126.978,
      country: 'South Korea',
      city: 'Seoul',
      district: 'Jung-gu',
      subregion: 'Seoul',
      isoCountryCode: 'KR',
      formattedAddress: 'Seoul, South Korea',
    };
    const { result } = renderHook(() => useScanCameraGateway());
    const galleryParams = mockedUseScanGalleryFlow.mock.calls[0]?.[0];

    expect(result.current.handleGallery).toEqual(expect.any(Function));
    expect(galleryParams).toBeDefined();

    await act(async () => {
      await galleryParams?.processLabel(
        'file://label-gallery.jpg',
        '2026-04-19T12:34:56Z',
        'library',
        exifLocation
      );
    });

    expect(mockedRunAnalysisFlow).toHaveBeenCalledTimes(1);
    expect(mockedRunAnalysisFlow).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: 'file://label-gallery.jpg',
        sourceType: 'library',
        timestamp: '2026-04-19T12:34:56Z',
        customLocation: exifLocation,
        analysisMode: 'label',
      })
    );
  });
});
