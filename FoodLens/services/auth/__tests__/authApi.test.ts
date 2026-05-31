jest.mock('@/services/aiCore/serverConfig', () => ({
  ServerConfig: {
    getServerUrl: jest.fn(),
  },
}));

import { ServerConfig } from '@/services/aiCore/serverConfig';
import { AuthApi } from '../authApi';

const mockedServerConfig = ServerConfig as jest.Mocked<typeof ServerConfig>;
const originalFetch = global.fetch;

const authPayload = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  expires_in: 900,
  user: {
    id: 'usr_oauth',
    email: 'oauth@example.com',
    provider: 'google',
  },
};

const mockAuthResponse = (): Response => (
  {
    ok: true,
    json: jest.fn(async () => authPayload),
  } as unknown as Response
);

const mockJsonResponse = (payload: object): Response => (
  {
    ok: true,
    json: jest.fn(async () => payload),
  } as unknown as Response
);

beforeEach(() => {
  jest.clearAllMocks();
  mockedServerConfig.getServerUrl.mockResolvedValue('https://api.example.com');
  global.fetch = jest.fn().mockResolvedValue(mockAuthResponse()) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe('AuthApi OAuth payloads', () => {
  it('does not send client-supplied identity for google login', async () => {
    await AuthApi.loginWithGoogle({
      code: 'google-code',
      state: 'google-state',
      redirectUri: 'foodlens://oauth/google-callback',
      callbackVerifier: 'google-callback-verifier',
      locale: 'ko-KR',
      deviceId: 'ios-device-1',
      email: 'injected@example.com',
      providerUserId: 'injected-google-subject',
    } as unknown as Parameters<typeof AuthApi.loginWithGoogle>[0]);

    const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(requestBody).toEqual({
      code: 'google-code',
      state: 'google-state',
      redirect_uri: 'foodlens://oauth/google-callback',
      callback_verifier: 'google-callback-verifier',
      locale: 'ko-KR',
      device_id: 'ios-device-1',
    });
    expect(requestBody).not.toHaveProperty('email');
    expect(requestBody).not.toHaveProperty('provider_user_id');
  });

  it('does not send client-supplied identity for kakao login', async () => {
    await AuthApi.loginWithKakao({
      code: 'kakao-code',
      state: 'kakao-state',
      redirectUri: 'foodlens://oauth/kakao-callback',
      callbackVerifier: 'kakao-callback-verifier',
      locale: 'ja-JP',
      deviceId: 'ios-device-2',
      email: 'injected@example.com',
      providerUserId: 'injected-kakao-subject',
    } as unknown as Parameters<typeof AuthApi.loginWithKakao>[0]);

    const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    expect(requestBody).toEqual({
      code: 'kakao-code',
      state: 'kakao-state',
      redirect_uri: 'foodlens://oauth/kakao-callback',
      callback_verifier: 'kakao-callback-verifier',
      locale: 'ja-JP',
      device_id: 'ios-device-2',
    });
    expect(requestBody).not.toHaveProperty('email');
    expect(requestBody).not.toHaveProperty('provider_user_id');
  });
});

describe('AuthApi logout payloads', () => {
  it('requires the server logout success marker', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockJsonResponse({
        request_id: 'req-logout-failed-contract',
        ok: false,
      })
    );

    await expect(
      AuthApi.logout({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_RESPONSE',
      status: 502,
      requestId: 'req-logout-failed-contract',
    });
  });

  it('sends logout tokens and accepts explicit server success', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockJsonResponse({
        request_id: 'req-logout-ok',
        ok: true,
      })
    );

    await AuthApi.logout({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    });

    const requestBody = JSON.parse((global.fetch as jest.Mock).mock.calls[0][1].body);
    const requestHeaders = (global.fetch as jest.Mock).mock.calls[0][1].headers;
    expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('https://api.example.com/auth/logout');
    expect(requestBody).toEqual({ refresh_token: 'refresh-token' });
    expect(requestHeaders).toMatchObject({ Authorization: 'Bearer access-token' });
  });

  it('rejects logout responses without the server success marker', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockJsonResponse({
        request_id: 'req-logout-missing-ok',
      })
    );

    await expect(
      AuthApi.logout({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      })
    ).rejects.toMatchObject({
      code: 'AUTH_INVALID_RESPONSE',
      status: 502,
      requestId: 'req-logout-missing-ok',
    });
  });
});

describe('AuthApi deletion request payloads', () => {
  it('parses the public-safe deletion status contract', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockJsonResponse({
        request_id: 'req-latest-http',
        deletion_request: {
          request_id: 'req-delete-1',
          target: 'data',
          status: 'failed',
          requested_at: '2026-03-29T00:00:00Z',
          completed_at: '2026-03-29T00:00:05Z',
          retryable: true,
          failure_code: 'DELETION_REQUEST_FAILED',
          message: 'Deletion request failed. Please retry or contact support with request_id.',
        },
      })
    );

    const deletionRequest = await AuthApi.getLatestDeletionRequest({
      accessToken: 'access-token',
    });

    expect(deletionRequest).toEqual({
      requestId: 'req-delete-1',
      target: 'data',
      status: 'failed',
      requestedAt: '2026-03-29T00:00:00Z',
      completedAt: '2026-03-29T00:00:05Z',
      retryable: true,
      failureCode: 'DELETION_REQUEST_FAILED',
      message: 'Deletion request failed. Please retry or contact support with request_id.',
    });
  });

  it('does not pass through unsafe deletion failure messages', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      mockJsonResponse({
        request_id: 'req-latest-http',
        deletion_request: {
          request_id: 'req-delete-unsafe',
          target: 'data',
          status: 'failed',
          requested_at: '2026-03-29T00:00:00Z',
          completed_at: '2026-03-29T00:00:05Z',
          retryable: true,
          failure_code: 'DELETION_REQUEST_FAILED',
          message: 'Traceback SELECT * FROM deletion_statuses gs://foodlens-private/user/original.jpg',
        },
      })
    );

    const deletionRequest = await AuthApi.getLatestDeletionRequest({
      accessToken: 'access-token',
    });

    expect(deletionRequest?.failureCode).toBe('DELETION_REQUEST_FAILED');
    expect(deletionRequest?.message).toBe(
      'Deletion request failed. Please retry or contact support with request_id.'
    );
    expect(deletionRequest?.message).not.toContain('Traceback');
    expect(deletionRequest?.message).not.toContain('SELECT *');
    expect(deletionRequest?.message).not.toContain('gs://foodlens-private');
  });
});
