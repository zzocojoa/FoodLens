import * as FileSystem from 'expo-file-system/legacy';
import { uploadWithRetry } from '../upload';
import { runWithAnalysisTimeout, sleep } from '../internal/retryUtils';

jest.mock('@/services/auth/currentUser', () => ({
  getCurrentUserId: jest.fn(() => 'user-1'),
}));

jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  FileSystemUploadType: { MULTIPART: 0 },
  createUploadTask: jest.fn(),
}));

jest.mock('../internal/retryUtils', () => ({
  runWithAnalysisTimeout: jest.fn(async (promise: Promise<unknown>) => promise),
  sleep: jest.fn(async () => undefined),
}));

type UploadTaskLike = {
  uploadAsync: () => Promise<FileSystem.FileSystemUploadResult>;
};

const mockedCreateUploadTask = FileSystem.createUploadTask as unknown as jest.Mock;

describe('uploadWithRetry', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCreateUploadTask.mockReset();
  });

  it('uses Retry-After delay for 429 responses', async () => {
    const uploadResponses: FileSystem.FileSystemUploadResult[] = [
      {
        status: 429,
        body: JSON.stringify({
          detail: {
            message: 'Too many requests',
            code: 'API_RATE_LIMITED',
            request_id: 'req-429',
            retry_after_seconds: 1,
          },
        }),
        headers: { 'Retry-After': '2' },
      } as unknown as FileSystem.FileSystemUploadResult,
      {
        status: 200,
        body: JSON.stringify({ ok: true }),
        headers: {},
      } as unknown as FileSystem.FileSystemUploadResult,
    ];

    let attempt = 0;
    mockedCreateUploadTask.mockImplementation(
      () =>
        ({
          uploadAsync: async () => {
            const response = uploadResponses[attempt];
            attempt += 1;
            return response;
          },
        }) as UploadTaskLike as FileSystem.UploadTask
    );

    const result = await uploadWithRetry('https://example.com/analyze', 'file://test.jpg', {}, 3);
    expect(result.status).toBe(200);
    expect(runWithAnalysisTimeout).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('does not retry 429 upstream rate limits', async () => {
    mockedCreateUploadTask.mockImplementation(
      () =>
        ({
          uploadAsync: async () =>
            ({
              status: 429,
              body: JSON.stringify({
                detail: {
                  message: 'Upstream rate limited',
                  code: 'UPSTREAM_RATE_LIMITED',
                  request_id: 'req-upstream-429',
                  retry_after_seconds: 10,
                },
              }),
              headers: { 'Retry-After': '10' },
            }) as unknown as FileSystem.FileSystemUploadResult,
        }) as UploadTaskLike as FileSystem.UploadTask
    );

    await expect(uploadWithRetry('https://example.com/analyze', 'file://test.jpg', {}, 3)).rejects.toThrow(
      'Upstream rate limited'
    );
    expect(runWithAnalysisTimeout).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry when server marks response non-retryable by client', async () => {
    mockedCreateUploadTask.mockImplementation(
      () =>
        ({
          uploadAsync: async () =>
            ({
              status: 503,
              body: JSON.stringify({
                detail: {
                  message: 'Temporary upstream failure',
                  code: 'API_RATE_LIMITED',
                  request_id: 'req-no-client-retry',
                  retryable_by_client: false,
                },
              }),
              headers: {},
            }) as unknown as FileSystem.FileSystemUploadResult,
        }) as UploadTaskLike as FileSystem.UploadTask
    );

    await expect(uploadWithRetry('https://example.com/analyze', 'file://test.jpg', {}, 3)).rejects.toThrow(
      'Temporary upstream failure'
    );
    expect(runWithAnalysisTimeout).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('fails immediately on non-retryable 4xx', async () => {
    mockedCreateUploadTask.mockImplementation(
      () =>
        ({
          uploadAsync: async () =>
            ({
              status: 400,
              body: JSON.stringify({
                detail: {
                  message: 'Bad request',
                  code: 'INVALID_INPUT',
                  request_id: 'req-400',
                },
              }),
              headers: {},
            }) as unknown as FileSystem.FileSystemUploadResult,
        }) as UploadTaskLike as FileSystem.UploadTask
    );

    await expect(uploadWithRetry('https://example.com/analyze', 'file://test.jpg', {}, 3)).rejects.toThrow(
      'Bad request'
    );
    expect(sleep).not.toHaveBeenCalled();
  });

  it('does not retry when client timeout is reached', async () => {
    const timeoutError = new Error('Operation timed out after 15000 ms');
    mockedCreateUploadTask.mockImplementation(
      () =>
        ({
          uploadAsync: async () =>
            ({
              status: 200,
              body: JSON.stringify({ ok: true }),
              headers: {},
            }) as unknown as FileSystem.FileSystemUploadResult,
        }) as UploadTaskLike as FileSystem.UploadTask
    );
    (runWithAnalysisTimeout as jest.Mock).mockRejectedValueOnce(timeoutError);

    await expect(uploadWithRetry('https://example.com/analyze', 'file://test.jpg', {}, 3)).rejects.toThrow(
      'Operation timed out after 15000 ms'
    );
    expect(runWithAnalysisTimeout).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });
});
