import { ServerConfig } from '@/services/aiCore/serverConfig';

const AUTH_TIMEOUT_MS = 15_000;

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  locale?: string;
  provider?: string;
};

export type AuthSessionTokens = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  issuedAt: number;
  user: AuthUser;
};

export type AuthEmailVerificationChallenge = {
  verificationRequired: true;
  verificationMethod: 'email_code';
  verificationChannel: 'email';
  verificationExpiresIn: number;
  verificationId?: string;
  debugCode?: string;
  user: AuthUser;
};

export type AuthEmailSignupResult = AuthSessionTokens | AuthEmailVerificationChallenge;

export type AuthPasswordResetChallenge = {
  resetRequested: true;
  resetMethod: 'email_code';
  resetChannel: 'email';
  resetExpiresIn: number;
  resetId?: string | null;
  debugCode?: string;
};

export type AuthDeletionRequestTarget = 'account' | 'data';
export type AuthDeletionRequestStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export type AuthDeletionRequest = {
  queueId: string;
  target: AuthDeletionRequestTarget;
  status: AuthDeletionRequestStatus;
  createdAt: string;
  updatedAt: string;
  reason: string;
  error?: string | null;
};

type AuthPayload = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  user?: AuthUser;
  request_id?: string;
  verification_required?: boolean;
  verification_method?: string;
  verification_channel?: string;
  verification_expires_in?: number;
  verification_id?: string;
  verification_debug_code?: string;
  reset_requested?: boolean;
  reset_method?: string;
  reset_channel?: string;
  reset_expires_in?: number;
  reset_id?: string | null;
  reset_debug_code?: string;
  password_reset?: boolean;
  sessions_revoked?: number;
};

type AuthDeletionRequestPayload = {
  queue_id?: string;
  target?: AuthDeletionRequestTarget;
  status?: AuthDeletionRequestStatus;
  created_at?: string;
  updated_at?: string;
  reason?: string;
  error?: string | null;
};

type AuthDeletionRequestEnvelope = {
  deletion_request?: AuthDeletionRequestPayload | null;
  request_id?: string;
};

type ApiErrorShape = {
  message?: string;
  code?: string;
  request_id?: string;
};

export class AuthApiError extends Error {
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

const createRequestId = (): string => {
  const random = Math.random().toString(16).slice(2, 10);
  return `auth-${Date.now().toString(36)}-${random}`;
};

const toSessionTokens = (payload: AuthPayload): AuthSessionTokens => {
  if (!payload.access_token || !payload.refresh_token || !payload.user?.id || !payload.expires_in) {
    throw new AuthApiError('Auth response is missing required fields.', 'AUTH_INVALID_RESPONSE', 502, payload.request_id);
  }

  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token,
    expiresIn: payload.expires_in,
    issuedAt: Date.now(),
    user: payload.user,
  };
};

const toEmailVerificationChallenge = (payload: AuthPayload): AuthEmailVerificationChallenge => {
  if (!payload.user?.id || typeof payload.verification_expires_in !== 'number') {
    throw new AuthApiError(
      'Email verification response is missing required fields.',
      'AUTH_INVALID_RESPONSE',
      502,
      payload.request_id
    );
  }

  return {
    verificationRequired: true,
    verificationMethod: 'email_code',
    verificationChannel: 'email',
    verificationExpiresIn: payload.verification_expires_in,
    verificationId: payload.verification_id,
    debugCode: payload.verification_debug_code,
    user: payload.user,
  };
};

export const isAuthEmailVerificationChallenge = (
  value: AuthEmailSignupResult
): value is AuthEmailVerificationChallenge => 'verificationRequired' in value;

const toPasswordResetChallenge = (payload: AuthPayload): AuthPasswordResetChallenge => {
  if (typeof payload.reset_expires_in !== 'number') {
    throw new AuthApiError(
      'Password reset response is missing required fields.',
      'AUTH_INVALID_RESPONSE',
      502,
      payload.request_id
    );
  }

  return {
    resetRequested: true,
    resetMethod: 'email_code',
    resetChannel: 'email',
    resetExpiresIn: payload.reset_expires_in,
    resetId: payload.reset_id ?? null,
    debugCode: payload.reset_debug_code,
  };
};

const toDeletionRequest = (
  payload: AuthDeletionRequestPayload | null | undefined,
  requestId?: string
): AuthDeletionRequest | null => {
  if (!payload) {
    return null;
  }

  if (
    !payload.queue_id ||
    !payload.target ||
    !payload.status ||
    !payload.created_at ||
    !payload.updated_at ||
    !payload.reason
  ) {
    throw new AuthApiError(
      'Deletion request response is missing required fields.',
      'AUTH_INVALID_RESPONSE',
      502,
      requestId
    );
  }

  return {
    queueId: payload.queue_id,
    target: payload.target,
    status: payload.status,
    createdAt: payload.created_at,
    updatedAt: payload.updated_at,
    reason: payload.reason,
    error: payload.error ?? null,
  };
};

const parseErrorResponse = async (response: Response): Promise<AuthApiError> => {
  let parsed: ApiErrorShape | null = null;

  try {
    const body = (await response.json()) as { detail?: ApiErrorShape } | ApiErrorShape;
    parsed = (body as { detail?: ApiErrorShape }).detail ?? (body as ApiErrorShape);
  } catch {
    parsed = null;
  }

  const code = parsed?.code || 'AUTH_REQUEST_FAILED';
  const message = parsed?.message || `Auth request failed (${response.status}).`;
  const requestId = parsed?.request_id;
  return new AuthApiError(message, code, response.status, requestId);
};

const postJson = async <T>(
  path: string,
  payload: object,
  options: { accessToken?: string } = {}
): Promise<T> => {
  const baseUrl = await ServerConfig.getServerUrl();
  const endpoint = `${baseUrl}${path}`;
  const requestId = createRequestId();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw await parseErrorResponse(response);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AuthApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new AuthApiError('Auth request timed out.', 'AUTH_TIMEOUT', 408, requestId);
    }

    throw new AuthApiError(
      error instanceof Error ? error.message : 'Unknown auth error',
      'AUTH_NETWORK_ERROR',
      0,
      requestId
    );
  } finally {
    clearTimeout(timeoutId);
  }
};

const getJson = async <T>(
  path: string,
  options: { accessToken?: string } = {}
): Promise<T> => {
  const baseUrl = await ServerConfig.getServerUrl();
  const endpoint = `${baseUrl}${path}`;
  const requestId = createRequestId();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-Request-Id': requestId,
        ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw await parseErrorResponse(response);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AuthApiError) {
      throw error;
    }

    if (error instanceof Error && error.name === 'AbortError') {
      throw new AuthApiError('Auth request timed out.', 'AUTH_TIMEOUT', 408, requestId);
    }

    throw new AuthApiError(
      error instanceof Error ? error.message : 'Unknown auth error',
      'AUTH_NETWORK_ERROR',
      0,
      requestId
    );
  } finally {
    clearTimeout(timeoutId);
  }
};

export const AuthApi = {
  async signupWithEmail(input: {
    email: string;
    password: string;
    displayName?: string;
    locale?: string;
    deviceId?: string;
  }): Promise<AuthEmailSignupResult> {
    const payload = await postJson<AuthPayload>('/auth/email/signup', {
      email: input.email,
      password: input.password,
      display_name: input.displayName,
      locale: input.locale,
      device_id: input.deviceId,
    });
    if (payload.verification_required) {
      return toEmailVerificationChallenge(payload);
    }
    return toSessionTokens(payload);
  },

  async loginWithEmail(input: {
    email: string;
    password: string;
    deviceId?: string;
  }): Promise<AuthSessionTokens> {
    const payload = await postJson<AuthPayload>('/auth/email/login', {
      email: input.email,
      password: input.password,
      device_id: input.deviceId,
    });
    return toSessionTokens(payload);
  },

  async verifyEmail(input: {
    email: string;
    code: string;
    deviceId?: string;
  }): Promise<AuthSessionTokens> {
    const payload = await postJson<AuthPayload>('/auth/email/verify', {
      email: input.email,
      code: input.code,
      device_id: input.deviceId,
    });
    return toSessionTokens(payload);
  },

  async requestEmailVerification(input: {
    email: string;
  }): Promise<AuthEmailVerificationChallenge> {
    const payload = await postJson<AuthPayload>('/auth/email/verification/request', {
      email: input.email,
    });
    return toEmailVerificationChallenge(payload);
  },

  async requestPasswordReset(input: {
    email: string;
  }): Promise<AuthPasswordResetChallenge> {
    const payload = await postJson<AuthPayload>('/auth/email/password/reset/request', {
      email: input.email,
    });
    if (!payload.reset_requested) {
      throw new AuthApiError(
        'Password reset request response is missing required fields.',
        'AUTH_INVALID_RESPONSE',
        502,
        payload.request_id
      );
    }
    return toPasswordResetChallenge(payload);
  },

  async confirmPasswordReset(input: {
    email: string;
    code: string;
    newPassword: string;
  }): Promise<void> {
    const payload = await postJson<AuthPayload>('/auth/email/password/reset/confirm', {
      email: input.email,
      code: input.code,
      new_password: input.newPassword,
    });
    if (!payload.password_reset) {
      throw new AuthApiError(
        'Password reset confirmation response is missing required fields.',
        'AUTH_INVALID_RESPONSE',
        502,
        payload.request_id
      );
    }
  },

  async loginWithGoogle(input: {
    code: string;
    state: string;
    redirectUri: string;
    email?: string;
    providerUserId?: string;
    locale?: string;
    deviceId?: string;
  }): Promise<AuthSessionTokens> {
    const payload = await postJson<AuthPayload>('/auth/google', {
      code: input.code,
      state: input.state,
      redirect_uri: input.redirectUri,
      email: input.email,
      provider_user_id: input.providerUserId,
      locale: input.locale,
      device_id: input.deviceId,
    });
    return toSessionTokens(payload);
  },

  async loginWithKakao(input: {
    code: string;
    state: string;
    redirectUri: string;
    email?: string;
    providerUserId?: string;
    locale?: string;
    deviceId?: string;
  }): Promise<AuthSessionTokens> {
    const payload = await postJson<AuthPayload>('/auth/kakao', {
      code: input.code,
      state: input.state,
      redirect_uri: input.redirectUri,
      email: input.email,
      provider_user_id: input.providerUserId,
      locale: input.locale,
      device_id: input.deviceId,
    });
    return toSessionTokens(payload);
  },

  async refresh(refreshToken: string): Promise<AuthSessionTokens> {
    const payload = await postJson<AuthPayload>('/auth/refresh', {
      refresh_token: refreshToken,
    });
    return toSessionTokens(payload);
  },

  async logout(input: { accessToken?: string; refreshToken?: string }): Promise<void> {
    await postJson<{ ok: boolean }>('/auth/logout', { refresh_token: input.refreshToken }, { accessToken: input.accessToken });
  },

  async getLatestDeletionRequest(input: { accessToken: string }): Promise<AuthDeletionRequest | null> {
    const payload = await getJson<AuthDeletionRequestEnvelope>('/me/deletion-requests/latest', {
      accessToken: input.accessToken,
    });
    return toDeletionRequest(payload.deletion_request, payload.request_id);
  },

  async createDeletionRequest(input: {
    accessToken: string;
    target: AuthDeletionRequestTarget;
  }): Promise<AuthDeletionRequest> {
    const payload = await postJson<AuthDeletionRequestEnvelope>(
      '/me/deletion-requests',
      { target: input.target },
      { accessToken: input.accessToken }
    );
    const deletionRequest = toDeletionRequest(payload.deletion_request, payload.request_id);
    if (!deletionRequest) {
      throw new AuthApiError(
        'Deletion request response is missing required fields.',
        'AUTH_INVALID_RESPONSE',
        502,
        payload.request_id
      );
    }
    return deletionRequest;
  },
};
