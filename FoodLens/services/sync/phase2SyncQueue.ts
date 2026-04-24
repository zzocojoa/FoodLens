import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import type { UserProfile } from '@/models/User';
import { SafeStorage } from '@/services/storage';
import { logger } from '@/services/logger';
import { getCurrentUserId, hasAuthenticatedUser } from '@/services/auth/currentUser';
import { restoreSession } from '@/services/auth/sessionManager';
import { getUserStorageKey } from '@/services/user/constants';
import { resolveImageUri } from '@/services/imageStorage';
import { IMAGE_DIR } from '@/services/imageStorage.helpers';
import { getStoredAnalyses, saveAnalyses } from '@/services/analysis/storage';
import { Phase2Api, Phase2SyncApiError } from './phase2Api';
import {
  buildRemoteClientState,
  mergeSyncedClientState,
  parseRemoteClientState,
} from './clientState';
import { deserializeHistoryItem, mergeRemoteHistory } from './phase2Mappers';
import type {
  MeHistoryItemResponse,
  MeSettingsClientState,
  MeSettingsResponse,
  Phase2ConflictResolution,
  Phase2HistoryCreatePayload,
  Phase2HistoryPayload,
  Phase2HistoryTimestampPatchPayload,
  Phase2SyncEntity,
  Phase2SyncOperation,
} from './phase2Sync.types';

const SYNC_QUEUE_KEY = '@foodlens_phase2_sync_queue_v1';
const MEDIA_MIGRATION_MARKER_PREFIX = '@foodlens_phase2_media_migrated:';
const RETRY_LIMIT = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const MAX_SYNCED_HISTORY = 30;
const MEDIA_UPLOAD_COOLDOWN_MS = 5 * 60 * 1_000;
const SETTINGS_DISPATCH_DEDUPE_WINDOW_MS = 5 * 60 * 1_000;

let runtimeStarted = false;
let dispatchInFlight: Promise<void> | null = null;
const mediaUploadCooldownUntil = new Map<string, number>();
const settingsDispatchDedupeCache = new Map<
  string,
  {
    payloadKey: string;
    at: number;
    requestId?: string;
  }
>();

const now = (): number => Date.now();

const generateOperationId = (): string =>
  `op-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;

const normalizePayloadForDedupe = (payload: Record<string, unknown>): string => {
  const clone = { ...payload } as Record<string, unknown>;
  delete clone['expected_updated_at'];
  return JSON.stringify(clone);
};

const isHistoryCreatePayload = (payload: Record<string, unknown>): payload is Phase2HistoryCreatePayload =>
  payload['kind'] === 'create' && !!payload['entry'] && typeof payload['entry'] === 'object';

const isHistoryTimestampPatchPayload = (
  payload: Record<string, unknown>
): payload is Phase2HistoryTimestampPatchPayload =>
  payload['kind'] === 'timestamp_patch' &&
  typeof payload['history_item_id'] === 'string' &&
  typeof payload['timestamp'] === 'string';

export const __resetPhase2SettingsDispatchDedupeForTests = (): void => {
  settingsDispatchDedupeCache.clear();
};

type MutableEntityState = 'pending' | 'failed' | 'sending' | 'conflicted';
const MUTABLE_ENTITY_STATES = new Set<MutableEntityState>([
  'pending',
  'failed',
  'sending',
  'conflicted',
]);

const isMutableEntityOperation = (
  item: Phase2SyncOperation,
  userId: string,
  entity: Exclude<Phase2SyncEntity, 'history'>
): boolean =>
  item.userId === userId &&
  item.entity === entity &&
  MUTABLE_ENTITY_STATES.has(item.state as MutableEntityState);

const findMutableEntityOperationIndex = (
  queue: Phase2SyncOperation[],
  userId: string,
  entity: Exclude<Phase2SyncEntity, 'history'>
): number => queue.findIndex((item) => isMutableEntityOperation(item, userId, entity));

const findLatestSyncedEntityOperation = (
  queue: Phase2SyncOperation[],
  userId: string,
  entity: Exclude<Phase2SyncEntity, 'history'>
): Phase2SyncOperation | undefined =>
  queue
    .filter((item) => item.userId === userId && item.entity === entity && item.state === 'synced')
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];

const findLatestMutableEntityOperation = (
  queue: Phase2SyncOperation[],
  userId: string,
  entity: Exclude<Phase2SyncEntity, 'history'>
): Phase2SyncOperation | undefined =>
  queue
    .filter((item) => isMutableEntityOperation(item, userId, entity))
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];

const loadQueue = async (): Promise<Phase2SyncOperation[]> =>
  SafeStorage.get<Phase2SyncOperation[]>(SYNC_QUEUE_KEY, []);

const saveQueue = async (queue: Phase2SyncOperation[]): Promise<void> => {
  await SafeStorage.set(SYNC_QUEUE_KEY, queue);
};

const getQueueOperationById = async (operationId: string): Promise<Phase2SyncOperation | null> => {
  const queue = await loadQueue();
  const operation = queue.find((item) => item.id === operationId);
  return operation || null;
};

const saveQueueOperation = async (operation: Phase2SyncOperation): Promise<boolean> => {
  const queue = await loadQueue();
  const index = queue.findIndex((item) => item.id === operation.id);
  if (index < 0) {
    return false;
  }
  queue[index] = operation;
  await saveQueue(pruneQueue(queue));
  return true;
};

const shouldDispatch = (item: Phase2SyncOperation): boolean => {
  if (item.state === 'pending') return true;
  if (item.state === 'failed' && item.attempts < RETRY_LIMIT && item.nextAttemptAt <= now()) return true;
  return false;
};

const nextRetryAt = (attempts: number): number => now() + RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1);

const isConflictError = (apiError: Phase2SyncApiError | null): boolean => {
  if (!apiError) return false;
  return apiError.status === 409 || apiError.code === 'PHASE2_CONFLICT';
};

const isAuthRecoveryError = (apiError: Phase2SyncApiError | null): boolean => {
  if (!apiError) return false;
  return (
    apiError.code === 'AUTH_SESSION_REQUIRED' ||
    apiError.code === 'AUTH_TOKEN_INVALID' ||
    apiError.code === 'AUTH_TOKEN_EXPIRED' ||
    apiError.code === 'AUTH_SESSION_REVOKED'
  );
};

const pruneQueue = (queue: Phase2SyncOperation[]): Phase2SyncOperation[] => {
  const synced = queue
    .filter((item) => item.state === 'synced')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SYNCED_HISTORY);
  const unsynced = queue.filter((item) => item.state !== 'synced');
  return [...unsynced, ...synced];
};

const mediaMigrationMarkerKey = (userId: string): string => `${MEDIA_MIGRATION_MARKER_PREFIX}${userId}`;
const mediaCooldownKey = (userId: string, scope: 'profile' | 'history'): string =>
  `${userId}:${scope}`;

const isNonBlockingMediaUploadError = (error: unknown): boolean => {
  if (!(error instanceof Phase2SyncApiError)) return false;
  const code = (error.code || '').trim().toUpperCase();
  if (code.startsWith('MEDIA_')) return true;
  return false;
};

const upsertPendingEntityOperation = async (
  userId: string,
  entity: Exclude<Phase2SyncEntity, 'history'>,
  payload: Record<string, unknown>
): Promise<void> => {
  const queue = await loadQueue();
  const existingIndex = findMutableEntityOperationIndex(queue, userId, entity);
  const item: Phase2SyncOperation = {
    id: existingIndex >= 0 ? queue[existingIndex].id : generateOperationId(),
    userId,
    entity,
    payload,
    attempts: 0,
    state: 'pending',
    nextAttemptAt: now(),
    createdAt: existingIndex >= 0 ? queue[existingIndex].createdAt : now(),
    updatedAt: now(),
    conflict: undefined,
  };
  if (existingIndex >= 0) {
    queue[existingIndex] = item;
  } else {
    queue.push(item);
  }
  await saveQueue(pruneQueue(queue));
};

type DispatchResult = {
  requestId?: string;
  profileUpdatedAt?: string;
  allergiesUpdatedAt?: string;
  settingsUpdatedAt?: string;
  profileImageAssetId?: string;
  profileImageRenderUrl?: string;
  settings?: MeSettingsResponse;
  historyItem?: MeHistoryItemResponse;
};

const applyServerVersionToLocalProfile = async (
  userId: string,
  versionPatch: {
    profileUpdatedAt?: string;
    allergiesUpdatedAt?: string;
    settingsUpdatedAt?: string;
    profileImageAssetId?: string;
    profileImageRenderUrl?: string;
  }
): Promise<void> => {
  if (
    !versionPatch.profileUpdatedAt &&
    !versionPatch.allergiesUpdatedAt &&
    !versionPatch.settingsUpdatedAt &&
    !versionPatch.profileImageAssetId &&
    !versionPatch.profileImageRenderUrl
  ) {
    return;
  }
  const storageKey = getUserStorageKey(userId);
  const current = await SafeStorage.get<UserProfile | null>(storageKey, null);
  if (!current) return;
  const nextSyncVersions = {
    ...(current.syncVersions || {}),
    ...(versionPatch.profileUpdatedAt ? { profileUpdatedAt: versionPatch.profileUpdatedAt } : {}),
    ...(versionPatch.allergiesUpdatedAt ? { allergiesUpdatedAt: versionPatch.allergiesUpdatedAt } : {}),
    ...(versionPatch.settingsUpdatedAt ? { settingsUpdatedAt: versionPatch.settingsUpdatedAt } : {}),
  };
  const nextUpdatedAt = versionPatch.profileUpdatedAt || current.updatedAt;
  const currentImage = current.profileImage?.trim() || '';
  const shouldKeepCurrentLocalImage =
    currentImage.length > 0 && isStableManagedLocalProfileImage(currentImage);
  const nextProfileImage = shouldKeepCurrentLocalImage
    ? current.profileImage
    : versionPatch.profileImageRenderUrl ?? current.profileImage;
  const nextProfile = {
    ...current,
    profileImageAssetId: versionPatch.profileImageAssetId ?? current.profileImageAssetId,
    profileImage: nextProfileImage,
    photoURL: nextProfileImage ?? current.photoURL,
    updatedAt: nextUpdatedAt,
    syncVersions: nextSyncVersions,
  };
  await SafeStorage.set(storageKey, nextProfile);
};

const applyServerSettingsToLocalProfile = async (
  userId: string,
  settings: MeSettingsResponse
): Promise<void> => {
  const storageKey = getUserStorageKey(userId);
  const current = await SafeStorage.get<UserProfile | null>(storageKey, null);
  if (!current) return;

  const nextProfile: UserProfile = {
    ...current,
    updatedAt: settings.updated_at || current.updatedAt,
    syncVersions: {
      ...(current.syncVersions || {}),
      ...(settings.updated_at ? { settingsUpdatedAt: settings.updated_at } : {}),
    },
    settings: {
      ...current.settings,
      ...(typeof settings.language === 'string' && settings.language.trim()
        ? { language: settings.language.trim() }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(settings, 'target_language')
        ? { targetLanguage: settings.target_language || undefined }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(settings, 'auto_play_audio')
        ? { autoPlayAudio: !!settings.auto_play_audio }
        : {}),
      ...(Object.prototype.hasOwnProperty.call(settings, 'selected_emoji')
        ? { selectedEmoji: settings.selected_emoji || undefined }
        : {}),
      clientState: mergeSyncedClientState(
        current.settings.clientState,
        parseRemoteClientState(settings.client_state)
      ),
    },
  };
  await SafeStorage.set(storageKey, nextProfile);
};

const applyServerHistoryItemToLocalAnalyses = async (
  userId: string,
  historyItem: MeHistoryItemResponse
): Promise<void> => {
  const current = await getStoredAnalyses(userId);
  const parsed = deserializeHistoryItem(historyItem);
  if (!parsed) return;

  const existing = current.find((item) => item.id === parsed.id);
  const mergedItem = existing
    ? mergeRemoteHistory([existing], [historyItem])[0]
    : parsed;
  const next = current.filter((item) => item.id !== mergedItem.id);
  next.unshift(mergedItem);
  next.sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
  await saveAnalyses(userId, next);
};

const isRemoteImageUri = (uri: string): boolean => {
  const normalized = uri.toLowerCase();
  return normalized.startsWith('http://') || normalized.startsWith('https://');
};

const isDataImageUri = (uri: string): boolean => uri.toLowerCase().startsWith('data:image/');

const isUnsupportedHistoryImageScheme = (uri: string): boolean => {
  const normalized = uri.toLowerCase();
  return normalized.startsWith('barcode://');
};

const hasLocalUploadUriScheme = (uri: string): boolean => {
  const normalized = uri.toLowerCase();
  return (
    normalized.startsWith('file://') ||
    normalized.startsWith('content://') ||
    normalized.startsWith('ph://') ||
    normalized.startsWith('assets-library://')
  );
};

const isStableManagedLocalProfileImage = (uri: string): boolean => {
  const normalized = uri.toLowerCase();
  if (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('data:image/') ||
    normalized.startsWith('barcode://')
  ) {
    return false;
  }
  if (
    normalized.startsWith('ph://') ||
    normalized.startsWith('content://') ||
    normalized.startsWith('assets-library://')
  ) {
    return false;
  }
  if (normalized.startsWith('file://') || normalized.startsWith('/')) {
    return uri.includes(IMAGE_DIR);
  }
  if (normalized.includes('://')) return false;
  return true;
};

const resolveHistoryImageFileUri = (rawUri: string): string | null => {
  if (!rawUri) return null;
  if (isRemoteImageUri(rawUri) || isUnsupportedHistoryImageScheme(rawUri)) {
    return null;
  }

  const resolved = resolveImageUri(rawUri) || rawUri;
  if (hasLocalUploadUriScheme(resolved) || resolved.startsWith('/')) {
    return resolved;
  }
  return null;
};

const inferContentTypeFromUri = (value: string): string => {
  const normalized = value.toLowerCase();
  if (normalized.endsWith('.png')) return 'image/png';
  if (normalized.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
};

const extensionFromContentType = (contentType: string): string => {
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'jpg';
};

type PreparedUploadSource = {
  fileUri: string;
  contentType: string;
  cleanup?: () => Promise<void>;
};

const writeDataUrlToTempFile = async (dataUrl: string): Promise<PreparedUploadSource | null> => {
  const matched = dataUrl.match(/^data:([^;,]+);base64,(.+)$/i);
  if (!matched) return null;
  const contentType = matched[1].trim().toLowerCase();
  const base64Payload = matched[2].trim();
  if (!base64Payload) return null;

  const baseDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!baseDir) return null;
  const ext = extensionFromContentType(contentType);
  const fileUri = `${baseDir}phase2-media-${Date.now().toString(36)}-${Math.random()
    .toString(16)
    .slice(2, 10)}.${ext}`;

  await FileSystem.writeAsStringAsync(fileUri, base64Payload, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return {
    fileUri,
    contentType,
    cleanup: async () => {
      await FileSystem.deleteAsync(fileUri, { idempotent: true });
    },
  };
};

const prepareUploadSource = async (rawUri: string): Promise<PreparedUploadSource | null> => {
  if (!rawUri) return null;
  const trimmed = rawUri.trim();
  if (!trimmed || isUnsupportedHistoryImageScheme(trimmed) || isRemoteImageUri(trimmed)) {
    return null;
  }

  if (isDataImageUri(trimmed)) {
    return writeDataUrlToTempFile(trimmed);
  }

  const resolved = resolveHistoryImageFileUri(trimmed);
  if (!resolved) return null;
  const contentType = inferContentTypeFromUri(resolved);
  const fileUri = hasLocalUploadUriScheme(resolved) ? resolved : `file://${resolved}`;
  return { fileUri, contentType };
};

const uploadMediaSource = async (
  userId: string,
  scope: 'profile' | 'history',
  rawUri: string,
  linkedEntryId?: string
): Promise<{ assetId: string; renderUrl?: string } | null> => {
  const cooldownKey = mediaCooldownKey(userId, scope);
  const cooldownUntil = mediaUploadCooldownUntil.get(cooldownKey) || 0;
  if (cooldownUntil > now()) {
    throw new Phase2SyncApiError(
      'Media backend is cooling down.',
      'MEDIA_BACKEND_UNAVAILABLE',
      503
    );
  }

  const prepared = await prepareUploadSource(rawUri);
  if (!prepared) return null;
  try {
    const result = await Phase2Api.postMediaUpload({
      fileUri: prepared.fileUri,
      contentType: prepared.contentType,
      fileName: `foodlens-${scope}.${extensionFromContentType(prepared.contentType)}`,
      scope,
      linkedEntryId,
    });
    return {
      assetId: result.asset.asset_id,
      renderUrl: result.asset.render_url,
    };
  } catch (error) {
    if (error instanceof Phase2SyncApiError) {
      const code = (error.code || '').trim().toUpperCase();
      if (error.status === 503 || code.startsWith('MEDIA_')) {
        mediaUploadCooldownUntil.set(cooldownKey, now() + MEDIA_UPLOAD_COOLDOWN_MS);
      }
    }
    logger.warn('[Phase2Sync] media upload failed', {
      request_id: error instanceof Phase2SyncApiError ? error.requestId || 'unknown' : 'unknown',
      user_id: userId,
      scope,
      code:
        error instanceof Phase2SyncApiError
          ? error.code
          : error instanceof Error
            ? error.message
            : 'MEDIA_UPLOAD_FAILED',
    });
    throw error;
  } finally {
    if (prepared.cleanup) {
      await prepared.cleanup().catch(() => {});
    }
  }
};

const normalizeProfilePayloadForSync = async (
  payload: Record<string, unknown>,
  userId: string
): Promise<{
  display_name?: string | null;
  profile_image_url?: string | null;
  profile_image_asset_id?: string | null;
  gender?: string | null;
  birth_year?: number | null;
  disliked_ingredients?: string[];
  locale?: string | null;
  timezone?: string | null;
  current_trip_start?: string | null;
  current_trip_location?: string | null;
  current_trip_coordinates?:
    | {
        latitude: number;
        longitude: number;
      }
    | null;
  expected_updated_at?: string;
}> => {
  const next = { ...payload } as Record<string, unknown>;
  const existingAssetId =
    typeof next['profile_image_asset_id'] === 'string'
      ? next['profile_image_asset_id'].trim()
      : '';
  const localCandidateRaw =
    typeof next['profile_image_local_uri'] === 'string'
      ? next['profile_image_local_uri'].trim()
      : typeof next['profile_image_url'] === 'string'
        ? next['profile_image_url'].trim()
        : '';

  if (!existingAssetId && localCandidateRaw && !isRemoteImageUri(localCandidateRaw)) {
    try {
      const uploaded = await uploadMediaSource(userId, 'profile', localCandidateRaw);
      if (uploaded?.assetId) {
        next['profile_image_asset_id'] = uploaded.assetId;
        next['profile_image_url'] = null;
      }
    } catch (error) {
      if (!isNonBlockingMediaUploadError(error)) {
        throw error;
      }
      logger.warn('[Phase2Sync] profile media upload bypassed; syncing profile without image', {
        request_id: error instanceof Phase2SyncApiError ? error.requestId || 'unknown' : 'unknown',
        user_id: userId,
        code:
          error instanceof Phase2SyncApiError
            ? error.code
            : error instanceof Error
              ? error.message
              : 'MEDIA_UPLOAD_FAILED',
      });
      delete next['profile_image_url'];
      delete next['profile_image_asset_id'];
      delete next['profile_image_local_uri'];
    }
  }

  if (typeof next['profile_image_url'] === 'string') {
    const currentImageUrl = next['profile_image_url'].trim();
    if (!currentImageUrl || !isRemoteImageUri(currentImageUrl)) {
      next['profile_image_url'] = null;
    }
  }
  if (typeof next['profile_image_asset_id'] === 'string' && next['profile_image_asset_id'].trim()) {
    next['profile_image_url'] = null;
  }
  delete next['profile_image_local_uri'];

  return next as {
    display_name?: string | null;
    profile_image_url?: string | null;
    profile_image_asset_id?: string | null;
    gender?: string | null;
    birth_year?: number | null;
    disliked_ingredients?: string[];
    locale?: string | null;
    timezone?: string | null;
    current_trip_start?: string | null;
    current_trip_location?: string | null;
    current_trip_coordinates?:
      | {
          latitude: number;
          longitude: number;
        }
      | null;
    expected_updated_at?: string;
  };
};

const normalizeHistoryEntryForSync = async (
  entry: Record<string, unknown>,
  userId: string
): Promise<Record<string, unknown>> => {
  const next = { ...entry };
  const existingAssetId = typeof next['image_asset_id'] === 'string' ? next['image_asset_id'].trim() : '';
  if (existingAssetId) {
    delete next['imageUri'];
    delete next['image_render_url'];
    return next;
  }

  const imageUri = typeof entry['imageUri'] === 'string' ? entry['imageUri'].trim() : '';
  if (!imageUri || isRemoteImageUri(imageUri) || isUnsupportedHistoryImageScheme(imageUri)) {
    return next;
  }

  const linkedEntryId = typeof next['id'] === 'string' ? next['id'] : undefined;
  let uploaded: { assetId: string; renderUrl?: string } | null = null;
  try {
    uploaded = await uploadMediaSource(userId, 'history', imageUri, linkedEntryId);
  } catch (error) {
    if (!isNonBlockingMediaUploadError(error)) {
      throw error;
    }
    logger.warn('[Phase2Sync] history media upload bypassed; syncing entry without image', {
      request_id: error instanceof Phase2SyncApiError ? error.requestId || 'unknown' : 'unknown',
      user_id: userId,
      history_id: linkedEntryId || 'unknown',
      code:
        error instanceof Phase2SyncApiError
          ? error.code
          : error instanceof Error
            ? error.message
            : 'MEDIA_UPLOAD_FAILED',
    });
    delete next['imageUri'];
    delete next['image_asset_id'];
    delete next['image_render_url'];
    return next;
  }

  if (!uploaded?.assetId) {
    return next;
  }

  next['image_asset_id'] = uploaded.assetId;
  next['image_render_url'] = uploaded.renderUrl || next['image_render_url'];
  delete next['imageUri'];
  return next;
};

const migrateLegacyMediaIfNeeded = async (userId: string): Promise<void> => {
  const alreadyMigrated = await SafeStorage.get<boolean>(mediaMigrationMarkerKey(userId), false);
  if (alreadyMigrated) return;

  let shouldMarkDone = true;

  const storageKey = getUserStorageKey(userId);
  const profile = await SafeStorage.get<UserProfile | null>(storageKey, null);
  if (profile?.profileImage && !profile.profileImageAssetId && !isRemoteImageUri(profile.profileImage)) {
    try {
      const uploaded = await uploadMediaSource(userId, 'profile', profile.profileImage);
      if (uploaded?.assetId) {
        const currentImage = profile.profileImage?.trim() || '';
        const shouldKeepCurrentLocalImage =
          currentImage.length > 0 && isStableManagedLocalProfileImage(currentImage);
        const nextProfileImage = shouldKeepCurrentLocalImage
          ? profile.profileImage
          : uploaded.renderUrl || profile.profileImage;
        const nextProfile: UserProfile = {
          ...profile,
          profileImageAssetId: uploaded.assetId,
          profileImage: nextProfileImage,
          photoURL: nextProfileImage || profile.photoURL,
          updatedAt: new Date().toISOString(),
        };
        await SafeStorage.set(storageKey, nextProfile);
        await upsertPendingEntityOperation(userId, 'profile', {
          profile_image_asset_id: uploaded.assetId,
          profile_image_url: null,
          expected_updated_at: profile.syncVersions?.profileUpdatedAt,
        });
      }
    } catch (error) {
      shouldMarkDone = false;
      logger.warn('[Phase2Sync] profile media migration deferred', {
        request_id: error instanceof Phase2SyncApiError ? error.requestId || 'unknown' : 'unknown',
        user_id: userId,
        code:
          error instanceof Phase2SyncApiError
            ? error.code
            : error instanceof Error
              ? error.message
              : 'PHASE2_MEDIA_MIGRATION_FAILED',
      });
    }
  }

  const analyses = await getStoredAnalyses(userId);
  if (analyses.length > 0) {
    let changed = false;
    for (const record of analyses) {
      const rawImageUri = typeof record.imageUri === 'string' ? record.imageUri.trim() : '';
      if (!rawImageUri || isRemoteImageUri(rawImageUri) || record.imageAssetId) {
        continue;
      }
      try {
        const uploaded = await uploadMediaSource(userId, 'history', rawImageUri, record.id);
        if (!uploaded?.assetId) {
          continue;
        }
        const shouldKeepLocalImage = isStableManagedLocalProfileImage(rawImageUri);
        record.imageAssetId = uploaded.assetId;
        record.imageRenderUrl = uploaded.renderUrl || record.imageRenderUrl;
        if (uploaded.renderUrl && !shouldKeepLocalImage) {
          record.imageUri = uploaded.renderUrl;
        }
        changed = true;

        try {
          await Phase2Api.patchHistoryImage(record.id, uploaded.assetId);
        } catch (patchError) {
          const apiError = patchError instanceof Phase2SyncApiError ? patchError : null;
          if (isAuthRecoveryError(apiError) || apiError?.status === 0) {
            shouldMarkDone = false;
            continue;
          }
          logger.warn('[Phase2Sync] history media patch skipped', {
            request_id: apiError?.requestId || 'unknown',
            user_id: userId,
            code: apiError?.code || 'PHASE2_HISTORY_MEDIA_PATCH_FAILED',
            history_id: record.id,
          });
        }
      } catch (error) {
        shouldMarkDone = false;
        logger.warn('[Phase2Sync] history media migration deferred', {
          request_id: error instanceof Phase2SyncApiError ? error.requestId || 'unknown' : 'unknown',
          user_id: userId,
          code:
            error instanceof Phase2SyncApiError
              ? error.code
              : error instanceof Error
                ? error.message
                : 'PHASE2_MEDIA_MIGRATION_FAILED',
          history_id: record.id,
        });
      }
    }
    if (changed) {
      await saveAnalyses(userId, analyses);
    }
  }

  if (shouldMarkDone) {
    await SafeStorage.set(mediaMigrationMarkerKey(userId), true);
  }
};

const buildSettingsConflictRetryPayload = (
  localPayload: {
    language?: string | null;
    target_language?: string | null;
    auto_play_audio?: boolean;
    selected_emoji?: string | null;
    client_state?: MeSettingsClientState;
    expected_updated_at?: string;
  },
  serverPayload: Record<string, unknown>
): {
  language?: string | null;
  target_language?: string | null;
  auto_play_audio?: boolean;
  selected_emoji?: string | null;
  client_state?: MeSettingsClientState;
  expected_updated_at?: string;
} | null => {
  const serverUpdatedAt =
    typeof serverPayload['updated_at'] === 'string' ? serverPayload['updated_at'].trim() : '';
  if (!serverUpdatedAt) {
    return null;
  }

  const mergedClientState = mergeSyncedClientState(
    parseRemoteClientState(serverPayload['client_state'] as MeSettingsClientState | null | undefined),
    parseRemoteClientState(localPayload.client_state)
  );

  return {
    language:
      typeof localPayload.language === 'string' || localPayload.language === null
        ? localPayload.language
        : typeof serverPayload['language'] === 'string'
          ? (serverPayload['language'] as string)
          : null,
    target_language: Object.prototype.hasOwnProperty.call(localPayload, 'target_language')
      ? localPayload.target_language
      : typeof serverPayload['target_language'] === 'string' || serverPayload['target_language'] === null
        ? (serverPayload['target_language'] as string | null)
        : undefined,
    auto_play_audio: Object.prototype.hasOwnProperty.call(localPayload, 'auto_play_audio')
      ? localPayload.auto_play_audio
      : typeof serverPayload['auto_play_audio'] === 'boolean'
        ? (serverPayload['auto_play_audio'] as boolean)
        : undefined,
    selected_emoji: Object.prototype.hasOwnProperty.call(localPayload, 'selected_emoji')
      ? localPayload.selected_emoji
      : typeof serverPayload['selected_emoji'] === 'string' || serverPayload['selected_emoji'] === null
        ? (serverPayload['selected_emoji'] as string | null)
        : undefined,
    client_state: buildRemoteClientState(mergedClientState),
    expected_updated_at: serverUpdatedAt,
  };
};

const dispatchOperation = async (operation: Phase2SyncOperation): Promise<DispatchResult> => {
  if (operation.entity === 'profile') {
    const profilePayload = await normalizeProfilePayloadForSync(operation.payload, operation.userId);
    const result = await Phase2Api.putProfile(
      profilePayload
    );
    return {
      requestId: result.requestId,
      profileUpdatedAt: result.profile.updated_at,
      profileImageAssetId: result.profile.profile_image_asset_id || undefined,
      profileImageRenderUrl:
        result.profile.profile_image_render_url || result.profile.profile_image_url || undefined,
    };
  }

  if (operation.entity === 'allergies') {
    const result = await Phase2Api.putAllergies(
      operation.payload as {
        allergies?: string[];
        dietary_restrictions?: string[];
        severity_map?: Record<string, string>;
        expected_updated_at?: string;
      }
    );
    return {
      requestId: result.requestId,
      allergiesUpdatedAt: result.allergies.updated_at,
    };
  }

  if (operation.entity === 'settings') {
    const dedupeKey = normalizePayloadForDedupe(operation.payload as Record<string, unknown>);
    const dedupeState = settingsDispatchDedupeCache.get(operation.userId);
    if (
      dedupeState &&
      dedupeState.payloadKey === dedupeKey &&
      now() - dedupeState.at <= SETTINGS_DISPATCH_DEDUPE_WINDOW_MS
    ) {
      return {
        requestId: dedupeState.requestId,
      };
    }

    const payload = operation.payload as {
      language?: string | null;
      target_language?: string | null;
      auto_play_audio?: boolean;
      selected_emoji?: string | null;
      client_state?: MeSettingsClientState;
      expected_updated_at?: string;
    };
    let result;
    try {
      result = await Phase2Api.putSettings(payload);
    } catch (error) {
      const apiError = error instanceof Phase2SyncApiError ? error : null;
      const hasClientState = Object.prototype.hasOwnProperty.call(payload, 'client_state');
      if (apiError && isConflictError(apiError) && hasClientState && apiError.serverPayload) {
        const retryPayload = buildSettingsConflictRetryPayload(payload, apiError.serverPayload);
        if (!retryPayload) {
          throw error;
        }
        try {
          result = await Phase2Api.putSettings(retryPayload);
        } catch (retryError) {
          const retryApiError = retryError instanceof Phase2SyncApiError ? retryError : null;
          if (retryApiError && isConflictError(retryApiError)) {
            throw new Phase2SyncApiError(
              'Settings client_state conflict retry failed.',
              'PHASE2_SETTINGS_CLIENT_STATE_RETRY_FAILED',
              400,
              retryApiError.requestId,
              retryApiError.serverPayload
            );
          }
          throw retryError;
        }
      } else {
        throw error;
      }
    }
    settingsDispatchDedupeCache.set(operation.userId, {
      payloadKey: dedupeKey,
      at: now(),
      requestId: result.requestId,
    });
    return {
      requestId: result.requestId,
      settingsUpdatedAt: result.settings.updated_at,
      settings: result.settings,
    };
  }

  const historyPayload = operation.payload as Phase2HistoryPayload;
  if (isHistoryCreatePayload(historyPayload)) {
    const historyEntry = await normalizeHistoryEntryForSync(historyPayload.entry, operation.userId);
    const historyResult = await Phase2Api.postHistory({
      entry: historyEntry,
      idempotency_key: operation.idempotencyKey,
    });
    return {
      requestId: historyResult.requestId,
      historyItem: historyResult.historyItem,
    };
  }

  if (isHistoryTimestampPatchPayload(historyPayload)) {
    try {
      const historyResult = await Phase2Api.patchHistoryTimestamp({
        historyItemId: historyPayload.history_item_id,
        timestamp: historyPayload.timestamp,
        expected_updated_at: historyPayload.expected_updated_at,
      });
      return {
        requestId: historyResult.requestId,
        historyItem: historyResult.historyItem,
      };
    } catch (error) {
      const apiError = error instanceof Phase2SyncApiError ? error : null;
      const serverUpdatedAt =
        typeof apiError?.serverPayload?.['updated_at'] === 'string'
          ? String(apiError.serverPayload?.['updated_at']).trim()
          : '';
      if (apiError && isConflictError(apiError) && serverUpdatedAt) {
        try {
          const retryResult = await Phase2Api.patchHistoryTimestamp({
            historyItemId: historyPayload.history_item_id,
            timestamp: historyPayload.timestamp,
            expected_updated_at: serverUpdatedAt,
          });
          return {
            requestId: retryResult.requestId,
            historyItem: retryResult.historyItem,
          };
        } catch (retryError) {
          const retryApiError = retryError instanceof Phase2SyncApiError ? retryError : null;
          if (retryApiError && isConflictError(retryApiError)) {
            throw new Phase2SyncApiError(
              'History timestamp conflict retry failed.',
              'PHASE2_HISTORY_TIMESTAMP_RETRY_FAILED',
              400,
              retryApiError.requestId,
              retryApiError.serverPayload
            );
          }
          throw retryError;
        }
      }
      throw error;
    }
  }

  throw new Error('PHASE2_HISTORY_PAYLOAD_INVALID');
};

const isNetworkAvailable = async (): Promise<boolean> => {
  try {
    const state = await NetInfo.fetch();
    if (state.isConnected === false) return false;
    if (state.isInternetReachable === false) return false;
    return true;
  } catch {
    // If connectivity probe fails, prefer trying actual requests.
    return true;
  }
};

const withDispatchLock = async (runner: () => Promise<void>): Promise<void> => {
  while (dispatchInFlight) {
    await dispatchInFlight;
  }
  dispatchInFlight = runner().finally(() => {
    dispatchInFlight = null;
  });
  await dispatchInFlight;
};

const resolveActiveUserId = async (): Promise<string | null> => {
  const restoredSession = await restoreSession({
    clearCurrentUserOnMissing: false,
    logWarnings: false,
  });
  const restoredUserId = restoredSession?.user?.id;
  if (typeof restoredUserId === 'string') {
    const normalizedRestored = restoredUserId.trim();
    if (normalizedRestored.length > 0) {
      return normalizedRestored;
    }
  }

  if (hasAuthenticatedUser()) {
    const userId = getCurrentUserId();
    if (typeof userId === 'string' && userId.trim().length > 0) {
      return userId;
    }
  }

  const fallbackUserId = restoredSession?.user?.id;
  if (typeof fallbackUserId !== 'string') return null;
  const normalized = fallbackUserId.trim();
  return normalized.length > 0 ? normalized : null;
};

export const dispatchPhase2SyncQueue = async (
  options: { force?: boolean } = {}
): Promise<void> =>
  withDispatchLock(async () => {
    if (!options.force && !(await isNetworkAvailable())) return;
    const activeUserId = await resolveActiveUserId();
    if (!activeUserId) return;
    await migrateLegacyMediaIfNeeded(activeUserId);

    const queue = await loadQueue();
    if (queue.length === 0) return;

    const ordered = [...queue]
      .filter((item) => item.userId === activeUserId && shouldDispatch(item))
      .sort((a, b) => a.createdAt - b.createdAt);

    if (ordered.length === 0) return;

    for (const item of ordered) {
      const latest = await getQueueOperationById(item.id);
      if (!latest) continue;
      if (latest.userId !== activeUserId) continue;
      if (!shouldDispatch(latest)) continue;

      const sending = {
        ...latest,
        state: 'sending' as const,
        updatedAt: now(),
      };
      const markedSending = await saveQueueOperation(sending);
      if (!markedSending) {
        continue;
      }

      try {
        const result = await dispatchOperation(sending);
        const synced: Phase2SyncOperation = {
          ...sending,
          state: 'synced',
          updatedAt: now(),
          requestId: result.requestId,
          lastError: undefined,
        };
        await applyServerVersionToLocalProfile(sending.userId, {
          profileUpdatedAt: result.profileUpdatedAt,
          allergiesUpdatedAt: result.allergiesUpdatedAt,
          settingsUpdatedAt: result.settingsUpdatedAt,
          profileImageAssetId: result.profileImageAssetId,
          profileImageRenderUrl: result.profileImageRenderUrl,
        });
        if (result.settings) {
          await applyServerSettingsToLocalProfile(sending.userId, result.settings);
        }
        if (result.historyItem) {
          await applyServerHistoryItemToLocalAnalyses(sending.userId, result.historyItem);
        }
        await saveQueueOperation(synced);
      } catch (error) {
        const previousAttempts = sending.attempts + 1;
        const apiError = error instanceof Phase2SyncApiError ? error : null;

        if (isAuthRecoveryError(apiError)) {
          await saveQueueOperation({
            ...sending,
            state: 'pending',
            updatedAt: now(),
            nextAttemptAt: now() + RETRY_BASE_DELAY_MS,
            requestId: apiError?.requestId,
            lastError: undefined,
            conflict: undefined,
          });
          break;
        }

        if (isConflictError(apiError)) {
          await saveQueueOperation({
            ...sending,
            attempts: previousAttempts,
            state: 'conflicted',
            updatedAt: now(),
            nextAttemptAt: Number.MAX_SAFE_INTEGER,
            requestId: apiError?.requestId,
            lastError: apiError?.code || 'PHASE2_CONFLICT',
            conflict: {
              code: apiError?.code,
              message: apiError?.message,
              detectedAt: now(),
              serverPayload: apiError?.serverPayload,
            },
          });
          continue;
        }

        const reachedLimit = previousAttempts >= RETRY_LIMIT;

        const failed: Phase2SyncOperation = {
          ...sending,
          attempts: previousAttempts,
          state: 'failed',
          updatedAt: now(),
          nextAttemptAt: reachedLimit ? Number.MAX_SAFE_INTEGER : nextRetryAt(previousAttempts),
          requestId: apiError?.requestId,
          lastError: apiError?.code || (error instanceof Error ? error.message : 'unknown'),
          conflict: undefined,
        };

        logger.warn('[Phase2Sync] queue dispatch failed', {
          request_id: apiError?.requestId || 'unknown',
          user_id: sending.userId,
          entity: sending.entity,
          code: apiError?.code || 'PHASE2_QUEUE_FAILED',
          attempts: previousAttempts,
        });
        await saveQueueOperation(failed);
      }
    }
  });

export const enqueuePhase2Sync = async (
  userId: string,
  entity: Exclude<Phase2SyncEntity, 'history'>,
  payload: Record<string, unknown>
): Promise<string> => {
  const queue = await loadQueue();
  const incomingDedupeKey = normalizePayloadForDedupe(payload);
  const existingIndex = findMutableEntityOperationIndex(queue, userId, entity);
  if (existingIndex >= 0) {
    const existing = queue[existingIndex];
    if (normalizePayloadForDedupe(existing.payload) === incomingDedupeKey) {
      if (existing.state === 'pending' || existing.state === 'sending') {
        return existing.id;
      }
      // Keep retry semantics for failed/conflicted by letting caller overwrite payload and reset state below
    }
  }

  const lastSynced = findLatestSyncedEntityOperation(queue, userId, entity);
  if (lastSynced && normalizePayloadForDedupe(lastSynced.payload) === incomingDedupeKey) {
    return lastSynced.id;
  }

  const item: Phase2SyncOperation = {
    id: existingIndex >= 0 ? queue[existingIndex].id : generateOperationId(),
    userId,
    entity,
    payload,
    attempts: 0,
    state: 'pending',
    nextAttemptAt: now(),
    createdAt: existingIndex >= 0 ? queue[existingIndex].createdAt : now(),
    updatedAt: now(),
    conflict: undefined,
  };
  if (existingIndex >= 0) {
    queue[existingIndex] = item;
  } else {
    queue.push(item);
  }
  await saveQueue(pruneQueue(queue));
  void dispatchPhase2SyncQueue();
  return item.id;
};

export const enqueueHistorySync = async (
  userId: string,
  entry: Record<string, unknown>,
  idempotencyKey: string
): Promise<void> => {
  const queue = await loadQueue();
  const duplicate = queue.find(
    (item) =>
      item.userId === userId &&
      item.entity === 'history' &&
      item.idempotencyKey === idempotencyKey &&
      item.state !== 'failed'
  );
  if (duplicate) return;

  queue.push({
    id: generateOperationId(),
    userId,
    entity: 'history',
    payload: {
      kind: 'create',
      entry,
    },
    idempotencyKey,
    attempts: 0,
    state: 'pending',
    nextAttemptAt: now(),
    createdAt: now(),
    updatedAt: now(),
    conflict: undefined,
  });
  await saveQueue(pruneQueue(queue));
  void dispatchPhase2SyncQueue();
};

export const enqueueHistoryTimestampPatch = async (
  userId: string,
  payload: Phase2HistoryTimestampPatchPayload
): Promise<string> => {
  const queue = await loadQueue();
  const sendingDuplicate = queue.find((item) => {
    if (item.userId !== userId || item.entity !== 'history') return false;
    if (item.state !== 'sending') return false;
    if (!isHistoryTimestampPatchPayload(item.payload)) return false;
    return (
      item.payload.history_item_id === payload.history_item_id &&
      item.payload.timestamp === payload.timestamp
    );
  });
  if (sendingDuplicate) {
    return sendingDuplicate.id;
  }

  let existingIndex = -1;
  for (let index = queue.length - 1; index >= 0; index -= 1) {
    const item = queue[index];
    if (item.userId !== userId || item.entity !== 'history') continue;
    if (!MUTABLE_ENTITY_STATES.has(item.state as MutableEntityState)) continue;
    if (item.state === 'sending') continue;
    if (!isHistoryTimestampPatchPayload(item.payload)) continue;
    if (item.payload.history_item_id !== payload.history_item_id) continue;
    existingIndex = index;
    break;
  }
  const nextItem: Phase2SyncOperation = {
    id: existingIndex >= 0 ? queue[existingIndex].id : generateOperationId(),
    userId,
    entity: 'history',
    payload,
    attempts: 0,
    state: 'pending',
    nextAttemptAt: now(),
    createdAt: existingIndex >= 0 ? queue[existingIndex].createdAt : now(),
    updatedAt: now(),
    conflict: undefined,
  };
  if (existingIndex >= 0) {
    queue[existingIndex] = nextItem;
  } else {
    queue.push(nextItem);
  }
  await saveQueue(pruneQueue(queue));
  void dispatchPhase2SyncQueue();
  return nextItem.id;
};

export const getPhase2ConflictedOperations = async (
  userId?: string
): Promise<Phase2SyncOperation[]> => {
  const queue = await loadQueue();
  return queue.filter(
    (item) => item.state === 'conflicted' && (typeof userId !== 'string' || item.userId === userId)
  );
};

export const resolvePhase2Conflict = async ({
  operationId,
  resolution,
  mergedPayload,
}: {
  operationId: string;
  resolution: Phase2ConflictResolution;
  mergedPayload?: Record<string, unknown>;
}): Promise<boolean> => {
  const queue = await loadQueue();
  const index = queue.findIndex((item) => item.id === operationId);
  if (index < 0) return false;

  const item = queue[index];
  if (item.state !== 'conflicted') return false;

  if (resolution === 'use_server') {
    queue[index] = {
      ...item,
      state: 'synced',
      updatedAt: now(),
      nextAttemptAt: Number.MAX_SAFE_INTEGER,
      lastError: undefined,
      conflict: undefined,
    };
    await saveQueue(pruneQueue(queue));
    return true;
  }

  queue[index] = {
    ...item,
    state: 'pending',
    payload: mergedPayload ?? item.payload,
    attempts: 0,
    nextAttemptAt: now(),
    updatedAt: now(),
    lastError: undefined,
    conflict: undefined,
  };
  await saveQueue(pruneQueue(queue));
  await dispatchPhase2SyncQueue();
  return true;
};

export const startPhase2SyncRuntime = (): void => {
  if (runtimeStarted) return;
  runtimeStarted = true;
  NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      void dispatchPhase2SyncQueue();
    }
  });
  void dispatchPhase2SyncQueue();
};

export const getPhase2OperationsByIds = async (
  operationIds: string[]
): Promise<Phase2SyncOperation[]> => {
  if (operationIds.length === 0) return [];
  const idSet = new Set(operationIds);
  const queue = await loadQueue();
  return queue.filter((item) => idSet.has(item.id));
};

export const getPhase2SyncQueueSnapshot = async (): Promise<Phase2SyncOperation[]> => loadQueue();

export const getQueuedPhase2EntityPayload = async (
  userId: string,
  entity: Exclude<Phase2SyncEntity, 'history'>
): Promise<Record<string, unknown> | null> => {
  const queue = await loadQueue();
  const operation = findLatestMutableEntityOperation(queue, userId, entity);
  if (!operation) {
    return null;
  }
  return { ...operation.payload };
};
