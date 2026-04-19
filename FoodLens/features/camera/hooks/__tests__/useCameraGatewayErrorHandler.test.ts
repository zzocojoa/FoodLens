import { act, renderHook } from '@testing-library/react-native';
import { useCameraGatewayErrorHandler } from '../useCameraGatewayErrorHandler';
import { clearPendingAnalysisJob } from '@/services/aiCore/pendingAnalysisStore';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { logger } from '@/services/logger';

jest.mock('@/services/aiCore/pendingAnalysisStore', () => ({
  clearPendingAnalysisJob: jest.fn(async () => undefined),
}));

jest.mock('@/services/ui/uiAlerts', () => ({
  showTranslatedAlert: jest.fn(),
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
const mockedShowTranslatedAlert = showTranslatedAlert as jest.MockedFunction<typeof showTranslatedAlert>;
const mockedLogger = logger as jest.Mocked<typeof logger>;

const translate = (key: string, fallback?: string): string => fallback || key;

describe('useCameraGatewayErrorHandler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('clears pending analysis before surfacing a terminal error', async () => {
    const onExit = jest.fn();
    const resetState = jest.fn();
    const processImageRef = { current: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined) };

    const { result } = renderHook(() =>
      useCameraGatewayErrorHandler({
        t: translate,
        messages: {
          file: 'file-message',
          analysis: 'analysis-message',
        },
        onExit,
        resetState,
        processImageRef,
      })
    );

    await act(async () => {
      result.current(new Error('unexpected failure'), 'file://camera.jpg');
      await Promise.resolve();
    });

    expect(mockedClearPendingAnalysisJob).toHaveBeenCalledTimes(1);
    expect(resetState).toHaveBeenCalledTimes(1);
    expect(mockedShowTranslatedAlert).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(mockedLogger.warn).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: 'timeout message',
      error: new Error('[AI Job] polling timed out job_id=job_1 request_id=req_1'),
    },
    {
      label: 'stale error code',
      error: Object.assign(new Error('background job stalled'), {
        code: 'ANALYSIS_JOB_POLL_STALE',
      }),
    },
  ])('routes $label to the timeout alert instead of the generic analysis alert', async ({ error }) => {
    const onExit = jest.fn();
    const resetState = jest.fn();
    const processImageRef = { current: jest.fn<Promise<void>, [string]>().mockResolvedValue(undefined) };

    const { result } = renderHook(() =>
      useCameraGatewayErrorHandler({
        t: translate,
        messages: {
          file: 'file-message',
          analysis: 'analysis-message',
        },
        onExit,
        resetState,
        processImageRef,
      })
    );

    await act(async () => {
      result.current(error, 'file://camera.jpg');
      await Promise.resolve();
    });

    expect(mockedClearPendingAnalysisJob).toHaveBeenCalledTimes(1);
    expect(resetState).toHaveBeenCalledTimes(1);
    expect(mockedShowTranslatedAlert).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        titleKey: 'camera.alert.analysisFailedTitle',
        messageKey: 'scan.alert.analysisTimeout',
      })
    );
    expect(onExit).toHaveBeenCalledTimes(1);
  });
});
