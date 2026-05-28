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
      locale: 'ja-JP',
      device_id: 'ios-device-2',
    });
    expect(requestBody).not.toHaveProperty('email');
    expect(requestBody).not.toHaveProperty('provider_user_id');
  });
});
