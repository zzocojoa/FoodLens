import { Phase2Api, Phase2SyncApiError } from '../phase2Api';

jest.mock('@/services/aiCore/serverConfig_Logic', () => ({
  ServerConfig: {
    getServerUrl: jest.fn(),
  },
}));

jest.mock('@/services/auth/sessionManager_Logic', () => ({
  restoreSession: jest.fn(),
  refreshSessionNow: jest.fn(),
}));

import { ServerConfig } from '@/services/aiCore/serverConfig_Logic';
import { refreshSessionNow, restoreSession } from '@/services/auth/sessionManager_Logic';

const mockedServerConfig = ServerConfig as jest.Mocked<typeof ServerConfig>;
const mockedRestoreSession = restoreSession as jest.Mock;
const mockedRefreshSessionNow = refreshSessionNow as jest.Mock;

const session = {
  accessToken: 'atk-old',
  refreshToken: 'rtk-old',
  expiresIn: 900,
  issuedAt: Date.now(),
  user: { id: 'usr_1', email: 'user@example.com' },
};

const refreshedSession = {
  ...session,
  accessToken: 'atk-new',
  refreshToken: 'rtk-new',
};

const makeResponse = (status: number, payload: unknown): Response =>
  ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(payload),
  } as unknown as Response);

describe('phase2Api auth recovery', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    jest.resetAllMocks();
    mockedServerConfig.getServerUrl.mockResolvedValue('https://api.example.com');
    mockedRestoreSession.mockResolvedValue(session);
    mockedRefreshSessionNow.mockResolvedValue(refreshedSession);
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('retries once after AUTH_TOKEN_INVALID and succeeds with refreshed token', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        makeResponse(401, {
          detail: { code: 'AUTH_TOKEN_INVALID', message: 'invalid', request_id: 'req-auth-1' },
        })
      )
      .mockResolvedValueOnce(
        makeResponse(200, {
          profile: { user_id: 'usr_1', email: 'user@example.com' },
          request_id: 'req-auth-2',
        })
      );

    const result = await Phase2Api.getProfile();

    expect(result.requestId).toBe('req-auth-2');
    expect(mockedRefreshSessionNow).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[1][1].headers.Authorization).toBe('Bearer atk-new');
  });

  it('normalizes to AUTH_SESSION_REQUIRED when refresh recovery fails', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce(
      makeResponse(401, {
        detail: { code: 'AUTH_TOKEN_EXPIRED', message: 'expired', request_id: 'req-auth-3' },
      })
    );
    mockedRefreshSessionNow.mockResolvedValueOnce(null);

    await expect(Phase2Api.getSettings()).rejects.toMatchObject<Partial<Phase2SyncApiError>>({
      code: 'AUTH_SESSION_REQUIRED',
      status: 401,
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('retries media upload once after 401 and succeeds', async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        makeResponse(401, {
          detail: { code: 'AUTH_SESSION_REVOKED', message: 'revoked', request_id: 'req-auth-4' },
        })
      )
      .mockResolvedValueOnce(
        makeResponse(200, {
          asset: {
            asset_id: 'asset_1',
            scope: 'profile',
            mime_type: 'image/jpeg',
            size_bytes: 1200,
            render_url: 'https://cdn.example.com/media/render/asset_1',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          request_id: 'req-auth-5',
        })
      );

    const result = await Phase2Api.postMediaUpload({
      fileUri: '/tmp/sample.jpg',
      scope: 'profile',
      contentType: 'image/jpeg',
    });

    expect(result.asset.asset_id).toBe('asset_1');
    expect(mockedRefreshSessionNow).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect((global.fetch as jest.Mock).mock.calls[1][1].headers.Authorization).toBe('Bearer atk-new');
  });
});
