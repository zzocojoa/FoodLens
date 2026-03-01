import { UserProfile } from '../models/User';
import { SafeStorage } from './storage_Logic';
import { USER_STORAGE_KEY, getUserStorageKey } from './user/constants_Logic';
import { buildDefaultProfile } from './user/profileFactory_Logic';
import { ensureProfileImageExists, resolveAndValidateProfileImage } from './user/profileImage_Logic';
import { logger } from './logger_Logic';
import { Phase2Api, Phase2SyncApiError } from './sync/phase2Api_Logic';
import {
  buildProfileWritePayload,
  mergeRemoteUserSnapshot,
  normalizeLegacyProfileForUser,
} from './sync/phase2Mappers_Logic';
import {
  dispatchPhase2SyncQueue,
  enqueuePhase2Sync,
  getPhase2OperationsByIds,
  startPhase2SyncRuntime,
} from './sync/phase2SyncQueue_Logic';
import { getCurrentUserId, hasAuthenticatedUser } from './auth/currentUser_Logic';
import { restoreSession } from './auth/sessionManager_Logic';

const PROFILE_MIGRATION_MARKER_PREFIX = '@foodlens_phase2_profile_migrated:';
const PROFILE_SERVER_SYNC_MARKER_PREFIX = '@foodlens_phase2_profile_server_synced:';
const UNAUTHENTICATED_USER_ID = 'auth-required';

const profileMigrationMarkerKey = (userId: string): string => `${PROFILE_MIGRATION_MARKER_PREFIX}${userId}`;
const profileServerSyncMarkerKey = (userId: string): string => `${PROFILE_SERVER_SYNC_MARKER_PREFIX}${userId}`;

const normalizeUserId = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  return normalized;
};

const isUsableUserId = (value: string | null): value is string =>
  typeof value === 'string' && value.length > 0 && value !== UNAUTHENTICATED_USER_ID;

const resolveScopedUserId = async (uid: string): Promise<string> => {
  const session = await restoreSession({
    clearCurrentUserOnMissing: false,
    logWarnings: false,
  });
  const sessionUserId = normalizeUserId(session?.user?.id);
  if (isUsableUserId(sessionUserId)) {
    const requested = normalizeUserId(uid);
    if (isUsableUserId(requested) && requested !== sessionUserId) {
      logger.warn('[Auth] requested user id differs from active session; using session id', {
        request_id: 'auth-user-id-mismatch',
        requested_user_id: requested,
        session_user_id: sessionUserId,
      });
    }
    return sessionUserId;
  }

  const requested = normalizeUserId(uid);
  if (isUsableUserId(requested)) {
    return requested;
  }

  const current = hasAuthenticatedUser() ? normalizeUserId(getCurrentUserId()) : null;
  if (isUsableUserId(current)) {
    logger.info('[Auth] resolved fallback user id from current marker', undefined, 'UserService');
    return current;
  }

  throw new Error('Authenticated user id is required for profile sync operations.');
};

const loadScopedProfile = async (uid: string): Promise<UserProfile | null> => {
  return SafeStorage.get<UserProfile | null>(getUserStorageKey(uid), null);
};

const saveScopedProfile = async (uid: string, profile: UserProfile): Promise<void> => {
  await SafeStorage.set(getUserStorageKey(uid), profile);
};

const migrateLegacyProfileIfNeeded = async (uid: string): Promise<UserProfile | null> => {
  const scopedProfile = await loadScopedProfile(uid);
  if (scopedProfile) {
    return scopedProfile;
  }

  const alreadyMigrated = await SafeStorage.get<boolean>(profileMigrationMarkerKey(uid), false);
  if (alreadyMigrated) {
    return null;
  }

  const legacy = await SafeStorage.get<UserProfile | null>(USER_STORAGE_KEY, null);
  if (!legacy) {
    await SafeStorage.set(profileMigrationMarkerKey(uid), true);
    return null;
  }

  const migrated = normalizeLegacyProfileForUser(uid, legacy);
  await saveScopedProfile(uid, migrated);
  await SafeStorage.remove(USER_STORAGE_KEY);
  await SafeStorage.set(profileMigrationMarkerKey(uid), true);
  return migrated;
};

const syncProfileFromServer = async (
  uid: string,
  fallbackProfile: UserProfile
): Promise<UserProfile | null> => {
  try {
    const [profileResult, allergiesResult, settingsResult] = await Promise.all([
      Phase2Api.getProfile(),
      Phase2Api.getAllergies(),
      Phase2Api.getSettings(),
    ]);
    const merged = mergeRemoteUserSnapshot(uid, fallbackProfile, {
      profile: profileResult.profile,
      allergies: allergiesResult.allergies,
      settings: settingsResult.settings,
    });
    await saveScopedProfile(uid, merged);
    await SafeStorage.set(profileServerSyncMarkerKey(uid), true);
    return merged;
  } catch (error) {
    const apiError = error instanceof Phase2SyncApiError ? error : null;
    if (apiError?.code === 'AUTH_SESSION_REQUIRED') {
      return null;
    }
    logger.warn('[Phase2Sync] profile pull failed', {
      request_id: apiError?.requestId || 'unknown',
      user_id: uid,
      code: apiError?.code || 'PHASE2_PROFILE_PULL_FAILED',
    });
    return null;
  }
};

const flushProfileWrites = async (uid: string, operationIds: string[]): Promise<void> => {
  try {
    await dispatchPhase2SyncQueue();
    const operations = await getPhase2OperationsByIds(operationIds);
    const unsynced = operations.filter((item) => item.state !== 'synced');
    if (unsynced.length > 0) {
      logger.warn('[Phase2Sync] profile write not confirmed', {
        request_id: 'phase2-profile-write-not-synced',
        user_id: uid,
        operations: unsynced.map((item) => ({
          id: item.id,
          entity: item.entity,
          state: item.state,
          last_error: item.lastError,
        })),
      });
      throw new Error('PHASE2_SYNC_NOT_CONFIRMED');
    }
  } catch (error) {
    logger.warn('[Phase2Sync] profile write flush failed', {
      request_id: 'unknown',
      user_id: uid,
      code: error instanceof Error ? error.message : 'PHASE2_PROFILE_FLUSH_FAILED',
    });
    throw error;
  }
};

const queueProfileWrites = async (uid: string, profile: UserProfile): Promise<string[]> => {
  const payloads = buildProfileWritePayload(profile);
  return Promise.all([
    enqueuePhase2Sync(uid, 'profile', payloads.profile as Record<string, unknown>),
    enqueuePhase2Sync(uid, 'allergies', payloads.allergies as Record<string, unknown>),
    enqueuePhase2Sync(uid, 'settings', payloads.settings as Record<string, unknown>),
  ]);
};

export const UserService = {
  /**
   * Get user profile from local storage
   */
  async getUserProfile(uid: string): Promise<UserProfile> {
    const resolvedUserId = await resolveScopedUserId(uid);
    startPhase2SyncRuntime();
    const migrated = await migrateLegacyProfileIfNeeded(resolvedUserId);
    const cachedProfile = migrated || (await loadScopedProfile(resolvedUserId));
    const baseProfile = cachedProfile ?? buildDefaultProfile(resolvedUserId);

    const validated = await resolveAndValidateProfileImage(baseProfile);
    const resolvedProfile = validated.profile;
    const isValidImage = validated.isValidImage;
    if (!isValidImage) {
      resolvedProfile.profileImage = '';
    }
    const hydrated = await ensureProfileImageExists(resolvedUserId, resolvedProfile);
    await saveScopedProfile(resolvedUserId, hydrated);
    const serverSynced = await SafeStorage.get<boolean>(profileServerSyncMarkerKey(resolvedUserId), false);
    if (!serverSynced) {
      const operationIds = await queueProfileWrites(resolvedUserId, hydrated);
      await flushProfileWrites(resolvedUserId, operationIds);
      await SafeStorage.set(profileServerSyncMarkerKey(resolvedUserId), true);
    }

    if (!cachedProfile) {
      const remote = await syncProfileFromServer(resolvedUserId, hydrated);
      if (remote) return remote;
    } else {
      void syncProfileFromServer(resolvedUserId, hydrated);
    }

    return hydrated;
  },

  /**
   * Create or update user profile in local storage
   */
  async CreateOrUpdateProfile(uid: string, email: string, profileData: Partial<UserProfile> = {}) {
    try {
      const resolvedUserId = await resolveScopedUserId(uid);
      const now = new Date().toISOString();
      startPhase2SyncRuntime();
      const existing = (await migrateLegacyProfileIfNeeded(resolvedUserId)) || (await loadScopedProfile(resolvedUserId)) || buildDefaultProfile(resolvedUserId);
      const isNew = !existing.createdAt;
      const newProfile: UserProfile = {
        ...existing,
        uid: resolvedUserId,
        email: email || existing.email,
        updatedAt: now,
        createdAt: isNew ? now : existing.createdAt,
        ...profileData,
        safetyProfile: {
          ...existing.safetyProfile,
          ...(profileData.safetyProfile || {}),
        },
        settings: {
          ...existing.settings,
          ...(profileData.settings || {}),
        },
      };

      await saveScopedProfile(resolvedUserId, newProfile);
      await SafeStorage.set(profileMigrationMarkerKey(resolvedUserId), true);
      const operationIds = await queueProfileWrites(resolvedUserId, newProfile);
      await flushProfileWrites(resolvedUserId, operationIds);
      await SafeStorage.set(profileServerSyncMarkerKey(resolvedUserId), true);
      return newProfile;
    } catch (error) {
      logger.error('Error saving user profile', error, 'UserService');
      throw error;
    }
  },

  /**
   * Update specific fields (e.g. allergies)
   */
  async updateSafetyProfile(uid: string, safetyProfile: UserProfile['safetyProfile']) {
    return this.CreateOrUpdateProfile(uid, '', { safetyProfile });
  },

  /**
   * General purpose partial update
   */
  async updateUserProfile(uid: string, updates: Partial<UserProfile>) {
    return this.CreateOrUpdateProfile(uid, '', updates);
  },
};
