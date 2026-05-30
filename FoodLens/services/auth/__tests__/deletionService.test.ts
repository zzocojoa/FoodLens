import {
  clearLocalDeletionFootprint,
  consumeDeletionRequestFinalization,
  createDeletionRequest,
} from '../deletionService';

const mockCreateDeletionRequest = jest.fn();
const mockClearSession = jest.fn();
const mockRestoreSession = jest.fn();
const mockClearAll = jest.fn();

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
});
