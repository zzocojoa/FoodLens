import { ServerConfig } from '@/services/aiCore/serverConfig_Logic';
import { restoreSession } from '@/services/auth/sessionManager_Logic';
import type {
  MeAllergiesResponse,
  MeHistoryItemResponse,
  MeProfileResponse,
  MeSettingsResponse,
} from './phase2Sync.types_Structure';

const PHASE2_TIMEOUT_MS = 15_000;

type ApiErrorDetail = {
  code?: string;
  message?: string;
  request_id?: string;
  server_payload?: Record<string, unknown>;
};

type ApiEnvelope<T> = T & {
  request_id?: string;
};

export class Phase2SyncApiError extends Error {
  code: string;
  status: number;
  requestId?: string;
  retryable: boolean;
  serverPayload?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    status: number,
    requestId?: string,
    serverPayload?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'Phase2SyncApiError';
    this.code = code;
    this.status = status;
    this.requestId = requestId;
    this.retryable = status === 0 || status >= 500 || status === 408 || status === 429;
    this.serverPayload = serverPayload;
  }
}

const createRequestId = (): string => {
  const random = Math.random().toString(16).slice(2, 10);
  return `sync-${Date.now().toString(36)}-${random}`;
};

const parseError = async (response: Response): Promise<Phase2SyncApiError> => {
  let detail: ApiErrorDetail | null = null;
  try {
    const body = (await response.json()) as { detail?: ApiErrorDetail } | ApiErrorDetail;
    detail = (body as { detail?: ApiErrorDetail }).detail ?? (body as ApiErrorDetail);
  } catch {
    detail = null;
  }
  return new Phase2SyncApiError(
    detail?.message || `Phase2 request failed (${response.status}).`,
    detail?.code || 'PHASE2_REQUEST_FAILED',
    response.status,
    detail?.request_id,
    detail?.server_payload
  );
};

const authenticatedRequest = async <T>(
  path: string,
  init: RequestInit = {}
): Promise<{ data: T; requestId: string }> => {
  const session = await restoreSession({
    clearCurrentUserOnMissing: false,
    logWarnings: false,
  });
  if (!session) {
    throw new Phase2SyncApiError('Session is not available.', 'AUTH_SESSION_REQUIRED', 401);
  }

  const requestId = createRequestId();
  const baseUrl = await ServerConfig.getServerUrl();
  const endpoint = `${baseUrl}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PHASE2_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint, {
      ...init,
      headers: {
        ...(init.headers || {}),
        'X-Request-Id': requestId,
        Authorization: `Bearer ${session.accessToken}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw await parseError(response);
    }
    const payload = (await response.json()) as ApiEnvelope<T>;
    return {
      data: payload as T,
      requestId: payload.request_id || requestId,
    };
  } catch (error) {
    if (error instanceof Phase2SyncApiError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Phase2SyncApiError('Phase2 request timed out.', 'PHASE2_TIMEOUT', 408, requestId);
    }
    throw new Phase2SyncApiError(
      error instanceof Error ? error.message : 'Unknown phase2 network error',
      'PHASE2_NETWORK_ERROR',
      0,
      requestId
    );
  } finally {
    clearTimeout(timeoutId);
  }
};

export const Phase2Api = {
  async getProfile(): Promise<{ profile: MeProfileResponse; requestId: string }> {
    const { data, requestId } = await authenticatedRequest<{ profile: MeProfileResponse }>('/me/profile');
    return { profile: data.profile, requestId };
  },

  async putProfile(input: {
    display_name?: string | null;
    locale?: string | null;
    timezone?: string | null;
    expected_updated_at?: string;
  }): Promise<{ profile: MeProfileResponse; requestId: string }> {
    const { data, requestId } = await authenticatedRequest<{ profile: MeProfileResponse }>('/me/profile', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return { profile: data.profile, requestId };
  },

  async getAllergies(): Promise<{ allergies: MeAllergiesResponse; requestId: string }> {
    const { data, requestId } = await authenticatedRequest<{ allergies: MeAllergiesResponse }>('/me/allergies');
    return { allergies: data.allergies, requestId };
  },

  async putAllergies(input: {
    allergies?: string[];
    dietary_restrictions?: string[];
    severity_map?: Record<string, string>;
    expected_updated_at?: string;
  }): Promise<{ allergies: MeAllergiesResponse; requestId: string }> {
    const { data, requestId } = await authenticatedRequest<{ allergies: MeAllergiesResponse }>('/me/allergies', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return { allergies: data.allergies, requestId };
  },

  async getSettings(): Promise<{ settings: MeSettingsResponse; requestId: string }> {
    const { data, requestId } = await authenticatedRequest<{ settings: MeSettingsResponse }>('/me/settings');
    return { settings: data.settings, requestId };
  },

  async putSettings(input: {
    language?: string | null;
    target_language?: string | null;
    auto_play_audio?: boolean;
    selected_emoji?: string | null;
    expected_updated_at?: string;
  }): Promise<{ settings: MeSettingsResponse; requestId: string }> {
    const { data, requestId } = await authenticatedRequest<{ settings: MeSettingsResponse }>('/me/settings', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return { settings: data.settings, requestId };
  },

  async getHistory(limit?: number): Promise<{ history: MeHistoryItemResponse[]; requestId: string }> {
    const path = typeof limit === 'number' && limit > 0 ? `/me/history?limit=${limit}` : '/me/history';
    const { data, requestId } = await authenticatedRequest<{ history: MeHistoryItemResponse[] }>(path);
    return { history: data.history || [], requestId };
  },

  async postHistory(input: {
    entry: Record<string, unknown>;
    idempotency_key?: string;
  }): Promise<{ historyItem: MeHistoryItemResponse; requestId: string }> {
    const { data, requestId } = await authenticatedRequest<{ history_item: MeHistoryItemResponse }>('/me/history', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return { historyItem: data.history_item, requestId };
  },
};
