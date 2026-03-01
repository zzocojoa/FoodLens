export type Phase2SyncEntity = 'profile' | 'allergies' | 'settings' | 'history';

export type Phase2SyncState = 'pending' | 'sending' | 'failed' | 'conflicted' | 'synced';

export type Phase2ConflictResolution = 'use_server' | 'use_local';

export type Phase2ConflictMeta = {
  code?: string;
  message?: string;
  detectedAt: number;
  serverPayload?: Record<string, unknown>;
};

export type Phase2SyncOperation = {
  id: string;
  userId: string;
  entity: Phase2SyncEntity;
  state: Phase2SyncState;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  attempts: number;
  nextAttemptAt: number;
  requestId?: string;
  lastError?: string;
  conflict?: Phase2ConflictMeta;
  createdAt: number;
  updatedAt: number;
};

export type MeProfileResponse = {
  user_id: string;
  email: string;
  display_name?: string | null;
  locale?: string;
  timezone?: string;
  created_at?: string;
  updated_at?: string;
};

export type MeAllergiesResponse = {
  user_id: string;
  allergies: string[];
  dietary_restrictions: string[];
  severity_map?: Record<string, string>;
  updated_at?: string;
};

export type MeSettingsResponse = {
  user_id: string;
  language?: string;
  target_language?: string | null;
  auto_play_audio?: boolean;
  selected_emoji?: string | null;
  updated_at?: string;
};

export type MeHistoryItemResponse = {
  id: string;
  user_id: string;
  entry: Record<string, unknown>;
  idempotency_key?: string | null;
  created_at?: string;
  updated_at?: string;
};
