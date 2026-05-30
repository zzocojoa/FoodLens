import {
  clearLocalDeletionFootprint,
  consumeDeletionRequestFinalization,
  createDeletionRequest,
} from '../deletionService';

const mockCreateDeletionRequest = jest.fn();
const mockClearSession = jest.fn();
const mockRestoreSession = jest.fn();
const mockClearAll = jest.fn();
const mockDataStoreClear = jest.fn();
const mockClearManagedImageDirectory = jest.fn();
const mockClearAllPendingAnalysisJobs = jest.fn();
const mockClearAiCache = jest.fn();
const mockClearPhase2SyncQueue = jest.fn();
const mockClearInflightBarcodeLookups = jest.fn();
const mockBarcodeCacheClear = jest.fn();

jest.mock('../authApi', () => {
  class MockAuthApiError extends Error {
    code: string;
    status: number;
    requestId?: string;

    constructor(message: string, code: string, status: number, requestId?: string) {
      super(message);
      this.name = 'AuthApiError';
      this.code = code;
      this.status = status;
      this.requestId = requestId;
    }
  }

  return {
    AuthApi: {
      createDeletionRequest: (...args: unknown[]) => mockCreateDeletionRequest(...args),
    },
    AuthApiError: MockAuthApiError,
  };
});

jest.mock('../sessionManager', () => ({
  clearSession: (...args: unknown[]) => mockClearSession(...args),
  restoreSession: (...args: unknown[]) => mockRestoreSession(...args),
}));

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    clearAll: (...args: unknown[]) => mockClearAll(...args),
  },
}));

jest.mock('@/services/dataStore', () => ({
  dataStore: {
    clear: (...args: unknown[]) => mockDataStoreClear(...args),
  },
}));

jest.mock('@/services/imageStorage', () => ({
  clearManagedImageDirectory: (...args: unknown[]) => mockClearManagedImageDirectory(...args),
}));

jest.mock('@/services/aiCore/pendingAnalysisStore', () => ({
  clearAllPendingAnalysisJobs: (...args: unknown[]) => mockClearAllPendingAnalysisJobs(...args),
}));

jest.mock('@/services/aiCore/cache', () => ({
  clearAiCache: (...args: unknown[]) => mockClearAiCache(...args),
}));

jest.mock('@/services/aiCore/internal/barcodeLookup', () => ({
  clearInflightBarcodeLookups: (...args: unknown[]) => mockClearInflightBarcodeLookups(...args),
}));

jest.mock('@/services/aiCore/internal/barcodeCache', () => ({
  BarcodeCache: {
    clear: (...args: unknown[]) => mockBarcodeCacheClear(...args),
  },
}));

jest.mock('@/services/sync/phase2SyncQueue', () => ({
  clearPhase2SyncQueue: (...args: unknown[]) => mockClearPhase2SyncQueue(...args),
}));

describe('deletionService finalization replay guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRestoreSession.mockResolvedValue({
      accessToken: 'atk_profile',
      refreshToken: 'rtk_profile',
      expiresIn: 3600,
      issuedAt: Date.now(),
      user: {
        id: 'usr_profile',
        email: 'user@example.com',
      },
    });
    mockCreateDeletionRequest.mockResolvedValue({
      requestId: 'req-account-1',
      target: 'account',
      status: 'done',
      requestedAt: '2026-03-29T00:00:00Z',
      completedAt: '2026-03-29T00:00:02Z',
      retryable: false,
      failureCode: null,
      message: null,
    });
    mockClearSession.mockResolvedValue(undefined);
    mockClearAll.mockResolvedValue(undefined);
    mockDataStoreClear.mockResolvedValue(undefined);
    mockClearManagedImageDirectory.mockResolvedValue(undefined);
    mockClearAllPendingAnalysisJobs.mockResolvedValue(undefined);
    mockClearAiCache.mockResolvedValue(undefined);
    mockClearPhase2SyncQueue.mockResolvedValue(undefined);
    mockBarcodeCacheClear.mockResolvedValue(undefined);
  });

  it('does not finalize a completed request that was not submitted locally', () => {
    const shouldFinalize = consumeDeletionRequestFinalization({
      requestId: 'req-old-1',
      target: 'data',
      status: 'done',
      requestedAt: '2026-03-29T00:00:00Z',
      completedAt: '2026-03-29T00:10:00Z',
      retryable: false,
      failureCode: null,
      message: null,
    });

    expect(shouldFinalize).toBe(false);
  });

  it('finalizes a completed request once after it is submitted locally', async () => {
    const deletionRequest = await createDeletionRequest('account');

    expect(deletionRequest.requestId).toBe('req-account-1');
    expect(
      consumeDeletionRequestFinalization({
        requestId: 'req-account-1',
        target: 'account',
        status: 'done',
        requestedAt: '2026-03-29T00:00:00Z',
        completedAt: '2026-03-29T00:00:02Z',
        retryable: false,
        failureCode: null,
        message: null,
      })
    ).toBe(true);
    expect(
      consumeDeletionRequestFinalization({
        requestId: 'req-account-1',
        target: 'account',
        status: 'done',
        requestedAt: '2026-03-29T00:00:00Z',
        completedAt: '2026-03-29T00:00:02Z',
        retryable: false,
        failureCode: null,
        message: null,
      })
    ).toBe(false);
  });

  it('clears remembered local requests when local deletion footprint is cleared', async () => {
    await createDeletionRequest('account');

    await clearLocalDeletionFootprint();

    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(mockDataStoreClear).toHaveBeenCalledTimes(1);
    expect(mockClearManagedImageDirectory).toHaveBeenCalledTimes(1);
    expect(mockClearAllPendingAnalysisJobs).toHaveBeenCalledTimes(1);
    expect(mockClearAiCache).toHaveBeenCalledTimes(1);
    expect(mockBarcodeCacheClear).toHaveBeenCalledTimes(1);
    expect(mockClearPhase2SyncQueue).toHaveBeenCalledTimes(1);
    expect(mockClearInflightBarcodeLookups).toHaveBeenCalledTimes(1);
    expect(mockClearAll).toHaveBeenCalledTimes(1);
    expect(
      consumeDeletionRequestFinalization({
        requestId: 'req-account-1',
        target: 'account',
        status: 'done',
        requestedAt: '2026-03-29T00:00:00Z',
        completedAt: '2026-03-29T00:00:02Z',
        retryable: false,
        failureCode: null,
        message: null,
      })
    ).toBe(false);
  });

  it('rejects when any local deletion footprint cleanup fails', async () => {
    mockClearManagedImageDirectory.mockRejectedValue(new Error('managed image cleanup failed'));

    await expect(clearLocalDeletionFootprint()).rejects.toThrow('clearManagedImageDirectory');

    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(mockClearAll).toHaveBeenCalledTimes(1);
  });
});
