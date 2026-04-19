import { act, renderHook } from '@testing-library/react-native';
import { useCameraGateway } from '../useCameraGateway';
import { clearPendingAnalysisJob } from '@/services/aiCore/pendingAnalysisStore';

jest.mock('expo-image-picker', () => ({
  useCameraPermissions: jest.fn(() => [null, jest.fn()]),
}));

jest.mock('@/features/i18n', () => ({
  useI18n: jest.fn(() => ({
    t: (key: string, fallback?: string) => fallback || key,
  })),
}));

jest.mock('../../constants/camera.constants', () => ({
  getCameraErrorMessages: jest.fn(() => ({
    missingImage: 'missing-image',
    locationUnavailable: 'location-unavailable',
    offline: 'offline',
    file: 'file',
    analysis: 'analysis',
  })),
}));

jest.mock('../useCameraPermissionEffects', () => ({
  useCameraPermissionEffects: jest.fn(),
}));

jest.mock('../useCameraGatewayInitialization', () => ({
  useCameraGatewayInitialization: jest.fn(),
}));

jest.mock('../useCameraGatewayErrorHandler', () => ({
  useCameraGatewayErrorHandler: jest.fn(() => jest.fn()),
}));

jest.mock('../../services/cameraAnalysisService', () => ({
  resumeCameraImageAnalysis: jest.fn(async () => undefined),
  runCameraImageAnalysis: jest.fn(async () => undefined),
}));

jest.mock('@/services/ai', () => ({
  loadPendingAnalysisJob: jest.fn(async () => null),
}));

jest.mock('@/services/aiCore/pendingAnalysisStore', () => ({
  clearPendingAnalysisJob: jest.fn(async () => undefined),
}));

jest.mock('@/services/logger', () => ({
  logger: {
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockedClearPendingAnalysisJob =
  clearPendingAnalysisJob as jest.MockedFunction<typeof clearPendingAnalysisJob>;

describe('useCameraGateway', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears pending analysis when the camera analysis is cancelled', async () => {
    const onExit = jest.fn();
    const onSuccess = jest.fn();

    const { result } = renderHook(() =>
      useCameraGateway({
        params: {},
        isConnected: true,
        onExit,
        onSuccess,
      })
    );

    await act(async () => {
      result.current.handleCancelAnalysis();
      await Promise.resolve();
    });

    expect(mockedClearPendingAnalysisJob).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
