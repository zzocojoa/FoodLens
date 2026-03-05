import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import type { UserProfile } from '@/models/User';
import { SafeStorage } from '@/services/storage_Logic';
import { logger } from '@/services/logger_Logic';
import { getCurrentUserId, hasAuthenticatedUser } from '@/services/auth/currentUser_Logic';
import { restoreSession } from '@/services/auth/sessionManager_Logic';
import { getUserStorageKey } from '@/services/user/constants_Logic';
import { resolveImageUri } from '@/services/imageStorage_Logic';
import { getStoredAnalyses, saveAnalyses } from '@/services/analysis/storage_Logic';
import { Phase2Api, Phase2SyncApiError } from './phase2Api_Logic';
import type {
  Phase2ConflictResolution,
  Phase2SyncEntity,
  Phase2SyncOperation,
} from './phase2Sync.types_Structure';

const SYNC_QUEUE_KEY = '@foodlens_phase2_sync_queue_v1';
const MEDIA_MIGRATION_MARKER_PREFIX = '@foodlens_phase2_media_migrated:';
const RETRY_LIMIT = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const MAX_SYNCED_HISTORY = 30;
const MEDIA_UPLOAD_COOLDOWN_MS = 5 * 60 * 1_000;

let runtimeStarted = false;
let dispatchInFlight: Promise<void> | null = null;
const mediaUploadCooldownUntil = new Map<string, number>();

const now = (): number => Date.now();

const generateOperationId = (): string =>
  `op-${Date.now().toString(36)}-${Math.random().toString(16).slice(2, 10)}`;

const loadQueue = async (): Promise<Phase2SyncOperation[]> =>
  SafeStorage.get<Phase2SyncOperation[]>(SYNC_QUEUE_KEY, []);

const saveQueue = async (queue: Phase2SyncOperation[]): Promise<void> => {
  await SafeStorage.set(SYNC_QUEUE_KEY, queue);
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
  const existingIndex = queue.findIndex(
    (item) =>
      item.userId === userId &&
      item.entity === entity &&
      (item.state === 'pending' ||
        item.state === 'failed' ||
        item.state === 'sending' ||
        item.state === 'conflicted')
  );
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
  await SafeStorage.set(storageKey, {
    ...current,
    profileImageAssetId: versionPatch.profileImageAssetId ?? current.profileImageAssetId,
    profileImage: versionPatch.profileImageRenderUrl ?? current.profileImage,
    photoURL: versionPatch.profileImageRenderUrl ?? current.photoURL,
    updatedAt: nextUpdatedAt,
    syncVersions: nextSyncVersions,
  });
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

const resolveHistoryImageFileUri = (rawUri: string): string | null => {
  if (!rawUri) return null;
  if (isRemoteImageUri(rawUri) || isUnsupportedHistoryImageScheme(rawUri)) {
    return null;
  }

  const resolved = resolveImageUri(rawUri) || rawUri;
  if (
    resolved.startsWith('file://') ||
    resolved.startsWith('/') ||
    resolved.startsWith('content://') ||
    resolved.startsWith('ph://') ||
    resolved.startsWith('assets-library://')
  ) {
    return resolved;
  }
  return null;
};

const inferContentTypeFromDataUrl = (value: string): string => {
  const matched = value.match(/^data:([^;,]+);base64,/i);
  return matched?.[1]?.trim().toLowerCase() || 'image/jpeg';
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
  const fileUri = resolved.startsWith('file://') ? resolved : `file://${resolved}`;
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
        const nextProfile: UserProfile = {
          ...profile,
          profileImageAssetId: uploaded.assetId,
          profileImage: uploaded.renderUrl || profile.profileImage,
          photoURL: uploaded.renderUrl || profile.photoURL,
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
        record.imageAssetId = uploaded.assetId;
        record.imageRenderUrl = uploaded.renderUrl || record.imageRenderUrl;
        if (uploaded.renderUrl) {
          record.imageUri = uploaded.renderUrl;
        }
        changed = true;

        try {
          await Phase2Api.patchHistoryImage(record.id, uploaded.assetId);
        } catch (patchError) {
          const apiError = patchError instanceof Phase2SyncApiError ? patchError : null;
          if (apiError?.code === 'AUTH_SESSION_REQUIRED' || apiError?.status === 0) {
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
    const result = await Phase2Api.putSettings(
      operation.payload as {
        language?: string | null;
        target_language?: string | null;
        auto_play_audio?: boolean;
        selected_emoji?: string | null;
        expected_updated_at?: string;
      }
    );
    return {
      requestId: result.requestId,
      settingsUpdatedAt: result.settings.updated_at,
    };
  }

  const historyEntry = await normalizeHistoryEntryForSync(operation.payload, operation.userId);
  const historyResult = await Phase2Api.postHistory({
    entry: historyEntry,
    idempotency_key: operation.idempotencyKey,
  });
  return { requestId: historyResult.requestId };
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

    const mutable = [...queue];

    for (const item of ordered) {
      const index = mutable.findIndex((candidate) => candidate.id === item.id);
      if (index < 0) continue;

      const sending = {
        ...mutable[index],
        state: 'sending' as const,
        updatedAt: now(),
      };
      mutable[index] = sending;
      await saveQueue(pruneQueue(mutable));

      try {
        const result = await dispatchOperation(sending);
        mutable[index] = {
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
      } catch (error) {
        const previousAttempts = sending.attempts + 1;
        const apiError = error instanceof Phase2SyncApiError ? error : null;

        if (apiError?.code === 'AUTH_SESSION_REQUIRED') {
          mutable[index] = {
            ...sending,
            state: 'pending',
            updatedAt: now(),
            nextAttemptAt: now() + RETRY_BASE_DELAY_MS,
            requestId: apiError.requestId,
            lastError: undefined,
            conflict: undefined,
          };
          await saveQueue(pruneQueue(mutable));
          break;
        }

        if (isConflictError(apiError)) {
          mutable[index] = {
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
          };
          await saveQueue(pruneQueue(mutable));
          continue;
        }

        const reachedLimit = previousAttempts >= RETRY_LIMIT;

        mutable[index] = {
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
      }

      await saveQueue(pruneQueue(mutable));
    }
  });

export const enqueuePhase2Sync = async (
  userId: string,
  entity: Exclude<Phase2SyncEntity, 'history'>,
  payload: Record<string, unknown>
): Promise<string> => {
  const queue = await loadQueue();
  const existingIndex = queue.findIndex(
    (item) =>
      item.userId === userId &&
      item.entity === entity &&
      (item.state === 'pending' ||
        item.state === 'failed' ||
        item.state === 'sending' ||
        item.state === 'conflicted')
  );
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
    payload: entry,
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
