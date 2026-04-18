import { UserProfile } from '../models/User';
import { SafeStorage } from './storage';
import { USER_STORAGE_KEY, getUserStorageKey } from './user/constants';
import { buildDefaultProfile } from './user/profileFactory';
import { ensureProfileImageExists, resolveAndValidateProfileImage } from './user/profileImage';
import { publishUserProfileUpdated } from './user/userProfileStore';
import { logger } from './logger';
import { Phase2Api, Phase2SyncApiError } from './sync/phase2Api';
import {
  buildProfileWritePayload,
  mergeRemoteUserSnapshot,
  normalizeLegacyProfileForUser,
} from './sync/phase2Mappers';
import { mergeSyncedClientState, parseRemoteClientState } from './sync/clientState';
import { isRemoteSettingsSnapshotStale } from './sync/settingsFreshness';
import {
  dispatchPhase2SyncQueue,
  enqueuePhase2Sync,
  getQueuedPhase2EntityPayload,
  getPhase2OperationsByIds,
  startPhase2SyncRuntime,
} from './sync/phase2SyncQueue';
import { getCurrentUserId, hasAuthenticatedUser } from './auth/currentUser';
import { restoreSession } from './auth/sessionManager';

const PROFILE_MIGRATION_MARKER_PREFIX = '@foodlens_phase2_profile_migrated:';
const PROFILE_SERVER_SYNC_MARKER_PREFIX = '@foodlens_phase2_profile_server_synced:';
const UNAUTHENTICATED_USER_ID = 'auth-required';
const PROFILE_SERVER_PULL_COOLDOWN_MS = 15_000;
const AUTH_REQUIRED_ERROR_MESSAGE = 'Authenticated user id is required for profile sync operations.';

const profileServerPullInFlight = new Map<string, Promise<UserProfile | null>>();
const profileServerPullLastAt = new Map<string, number>();

const profileMigrationMarkerKey = (userId: string): string => `${PROFILE_MIGRATION_MARKER_PREFIX}${userId}`;
const profileServerSyncMarkerKey = (userId: string): string => `${PROFILE_SERVER_SYNC_MARKER_PREFIX}${userId}`;

const normalizeUserId = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  return normalized;
};

const normalizeEmail = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) return null;
  return normalized;
};

const isUsableUserId = (value: string | null): value is string =>
  typeof value === 'string' && value.length > 0 && value !== UNAUTHENTICATED_USER_ID;

type LegacyProfileMigrationDecision = {
  canMigrate: boolean;
  reason: 'match' | 'legacy_uid_mismatch' | 'legacy_email_mismatch' | 'missing_identity';
  sessionEmail: string | null;
  legacyEmail: string | null;
  legacyUserId: string | null;
};

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

  throw new Error(AUTH_REQUIRED_ERROR_MESSAGE);
};

const loadScopedProfile = async (uid: string): Promise<UserProfile | null> => {
  return SafeStorage.get<UserProfile | null>(getUserStorageKey(uid), null);
};

const saveScopedProfile = async (uid: string, profile: UserProfile): Promise<void> => {
  await SafeStorage.set(getUserStorageKey(uid), profile);
};

const resolveLegacyProfileMigrationDecision = async (
  uid: string,
  legacy: UserProfile
): Promise<LegacyProfileMigrationDecision> => {
  const legacyUserId = normalizeUserId(legacy.uid);
  if (isUsableUserId(legacyUserId) && legacyUserId !== uid) {
    return {
      canMigrate: false,
      reason: 'legacy_uid_mismatch',
      sessionEmail: null,
      legacyEmail: normalizeEmail(legacy.email),
      legacyUserId,
    };
  }

  const session = await restoreSession({
    clearCurrentUserOnMissing: false,
    logWarnings: false,
  });
  const sessionEmail = normalizeEmail(session?.user?.email);
  const legacyEmail = normalizeEmail(legacy.email);

  if (!legacyUserId) {
    if (!sessionEmail || !legacyEmail) {
      return {
        canMigrate: false,
        reason: 'missing_identity',
        sessionEmail,
        legacyEmail,
        legacyUserId,
      };
    }
    return {
      canMigrate: sessionEmail === legacyEmail,
      reason: sessionEmail === legacyEmail ? 'match' : 'legacy_email_mismatch',
      sessionEmail,
      legacyEmail,
      legacyUserId,
    };
  }

  if (sessionEmail && legacyEmail && sessionEmail !== legacyEmail) {
    return {
      canMigrate: false,
      reason: 'legacy_email_mismatch',
      sessionEmail,
      legacyEmail,
      legacyUserId,
    };
  }

  return {
    canMigrate: true,
    reason: 'match',
    sessionEmail,
    legacyEmail,
    legacyUserId,
  };
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

  const decision = await resolveLegacyProfileMigrationDecision(uid, legacy);
  if (!decision.canMigrate) {
    logger.warn('[Auth] skipped legacy profile migration due to identity mismatch', {
      request_id: 'auth-legacy-profile-migration-skipped',
      user_id: uid,
      legacy_user_id: decision.legacyUserId || 'unknown',
      session_email: decision.sessionEmail || 'unknown',
      legacy_email: decision.legacyEmail || 'unknown',
      reason: decision.reason,
    });
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
  fallbackProfile: UserProfile,
  options: { force?: boolean } = {}
): Promise<UserProfile | null> => {
  const force = options.force === true;
  const activePull = profileServerPullInFlight.get(uid);
  if (activePull) {
    return activePull;
  }

  const lastPulledAt = profileServerPullLastAt.get(uid);
  if (!force && typeof lastPulledAt === 'number' && Date.now() - lastPulledAt < PROFILE_SERVER_PULL_COOLDOWN_MS) {
    return null;
  }
  profileServerPullLastAt.set(uid, Date.now());

  const pullPromise = (async (): Promise<UserProfile | null> => {
    try {
      const [profileResult, allergiesResult, settingsResult] = await Promise.all([
        Phase2Api.getProfile(),
        Phase2Api.getAllergies(),
        Phase2Api.getSettings(),
      ]);
      const shouldIgnoreRemoteSettings = isRemoteSettingsSnapshotStale({
        localProfile: fallbackProfile,
        remoteSettings: settingsResult.settings,
      });
      if (shouldIgnoreRemoteSettings) {
        logger.warn('[Phase2Sync] ignoring stale remote settings during profile pull', {
          request_id: settingsResult.requestId || 'unknown',
          user_id: uid,
          local_updated_at: fallbackProfile.syncVersions?.settingsUpdatedAt || null,
          remote_updated_at: settingsResult.settings.updated_at || null,
        });
      }
      const merged = mergeRemoteUserSnapshot(uid, fallbackProfile, {
        profile: profileResult.profile,
        allergies: allergiesResult.allergies,
        settings: shouldIgnoreRemoteSettings ? undefined : settingsResult.settings,
      });
      const queuedSettingsPayload = await getQueuedPhase2EntityPayload(uid, 'settings');
      const effectiveProfile = applyQueuedSettingsPayloadToProfile(merged, queuedSettingsPayload);
      await saveScopedProfile(uid, effectiveProfile);
      await SafeStorage.set(profileServerSyncMarkerKey(uid), true);
      publishUserProfileUpdated(uid, 'server_pull');
      return effectiveProfile;
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
    } finally {
      profileServerPullInFlight.delete(uid);
    }
  })();
  profileServerPullInFlight.set(uid, pullPromise);
  return pullPromise;
};

const flushProfileWrites = async (uid: string, operationIds: string[]): Promise<void> => {
  try {
    await dispatchPhase2SyncQueue({ force: true });
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

type ProfileWriteEntity = 'profile' | 'allergies' | 'settings';

const PROFILE_WRITE_ENTITIES: ProfileWriteEntity[] = ['profile', 'allergies', 'settings'];

const resolveChangedProfileWriteEntities = (
  before: UserProfile,
  after: UserProfile
): ProfileWriteEntity[] => {
  const beforePayload = buildProfileWritePayload(before);
  const afterPayload = buildProfileWritePayload(after);

  return PROFILE_WRITE_ENTITIES.filter(
    (entity) => JSON.stringify(beforePayload[entity]) !== JSON.stringify(afterPayload[entity])
  );
};

const queueProfileWrites = async (
  uid: string,
  profile: UserProfile,
  entities: ProfileWriteEntity[] = PROFILE_WRITE_ENTITIES
): Promise<string[]> => {
  const payloads = buildProfileWritePayload(profile);
  const operationIds: string[] = [];

  for (const entity of entities) {
    const payload = payloads[entity] as Record<string, unknown>;
    operationIds.push(await enqueuePhase2Sync(uid, entity, payload));
  }

  return operationIds;
};

const applyQueuedSettingsPayloadToProfile = (
  profile: UserProfile,
  payload: Record<string, unknown> | null
): UserProfile => {
  if (!payload) {
    return profile;
  }

  const nextSettings = { ...profile.settings };

  if (typeof payload['language'] === 'string' && payload['language'].trim()) {
    nextSettings.language = payload['language'].trim();
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'target_language')) {
    const targetLanguage = payload['target_language'];
    if (typeof targetLanguage === 'string' && targetLanguage.trim()) {
      nextSettings.targetLanguage = targetLanguage.trim();
    } else {
      delete nextSettings.targetLanguage;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'auto_play_audio')) {
    nextSettings.autoPlayAudio = !!payload['auto_play_audio'];
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'selected_emoji')) {
    const selectedEmoji = payload['selected_emoji'];
    if (typeof selectedEmoji === 'string' && selectedEmoji.trim()) {
      nextSettings.selectedEmoji = selectedEmoji.trim();
    } else {
      delete nextSettings.selectedEmoji;
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'client_state')) {
    nextSettings.clientState = mergeSyncedClientState(
      nextSettings.clientState,
      parseRemoteClientState(payload['client_state'] as Parameters<typeof parseRemoteClientState>[0])
    );
  }

  return {
    ...profile,
    settings: nextSettings,
  };
};

const profileSyncComparableShape = (profile: UserProfile) => ({
  uid: profile.uid || '',
  email: profile.email || '',
  name: profile.name || '',
  profileImage: profile.profileImage || '',
  profileImageAssetId: profile.profileImageAssetId || '',
  gender: profile.gender || null,
  birthYear: profile.birthYear ?? null,
  currentTripStart: profile.currentTripStart || null,
  currentTripLocation: profile.currentTripLocation || null,
  currentTripCoordinates: profile.currentTripCoordinates || null,
  safetyProfile: {
    allergies: profile.safetyProfile?.allergies || [],
    dietaryRestrictions: profile.safetyProfile?.dietaryRestrictions || [],
    dislikedIngredients: profile.safetyProfile?.dislikedIngredients || [],
    severityMap: profile.safetyProfile?.severityMap || {},
  },
  settings: {
    language: profile.settings?.language || 'auto',
    targetLanguage: profile.settings?.targetLanguage || null,
    autoPlayAudio: !!profile.settings?.autoPlayAudio,
    selectedEmoji: profile.settings?.selectedEmoji || null,
    clientState: mergeSyncedClientState(undefined, profile.settings?.clientState),
  },
});

const isProfileSyncNoop = (before: UserProfile, after: UserProfile): boolean =>
  JSON.stringify(profileSyncComparableShape(before)) === JSON.stringify(profileSyncComparableShape(after));

type GetUserProfileOptions = {
  allowBackgroundRefresh?: boolean;
  forceServerRefresh?: boolean;
};

type UserProfilePatch = Omit<Partial<UserProfile>, 'settings' | 'safetyProfile'> & {
  settings?: Partial<UserProfile['settings']>;
  safetyProfile?: Partial<UserProfile['safetyProfile']>;
};

const mergeProfileSettingsPatch = (
  existingSettings: UserProfile['settings'],
  nextSettingsPatch?: UserProfilePatch['settings']
): UserProfile['settings'] => {
  if (!nextSettingsPatch) {
    return existingSettings;
  }

  const nextSettings: UserProfile['settings'] = {
    ...existingSettings,
    ...nextSettingsPatch,
  };

  if ('targetLanguage' in nextSettingsPatch && !nextSettingsPatch.targetLanguage) {
    delete nextSettings.targetLanguage;
  }

  if ('selectedEmoji' in nextSettingsPatch && !nextSettingsPatch.selectedEmoji) {
    delete nextSettings.selectedEmoji;
  }

  if ('clientState' in nextSettingsPatch) {
    nextSettings.clientState = mergeSyncedClientState(
      existingSettings.clientState,
      nextSettingsPatch.clientState
    );
  }

  return nextSettings;
};

export const UserService = {
  async syncProfileFromCloud(uid: string, options: { force?: boolean } = {}): Promise<UserProfile | null> {
    let resolvedUserId: string;
    try {
      resolvedUserId = await resolveScopedUserId(uid);
    } catch (error) {
      if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) {
        return null;
      }
      throw error;
    }

    startPhase2SyncRuntime();
    const localProfile =
      (await migrateLegacyProfileIfNeeded(resolvedUserId)) ||
      (await loadScopedProfile(resolvedUserId)) ||
      buildDefaultProfile(resolvedUserId);

    return syncProfileFromServer(resolvedUserId, localProfile, {
      force: options.force === true,
    });
  },

  /**
   * Get user profile from local storage
   */
  async getUserProfile(uid: string, options: GetUserProfileOptions = {}): Promise<UserProfile> {
    const allowBackgroundRefresh = options.allowBackgroundRefresh !== false;
    const forceServerRefresh = options.forceServerRefresh === true;
    let resolvedUserId: string;
    try {
      resolvedUserId = await resolveScopedUserId(uid);
    } catch (error) {
      if (error instanceof Error && error.message === AUTH_REQUIRED_ERROR_MESSAGE) {
        const requestedUserId = normalizeUserId(uid) ?? UNAUTHENTICATED_USER_ID;
        const fallbackUserId = requestedUserId;
        if (requestedUserId !== UNAUTHENTICATED_USER_ID) {
          logger.warn('[Auth] profile read requested without authenticated user; returning fallback profile', {
            request_id: 'auth-profile-read-without-user',
            requested_user_id: requestedUserId,
            fallback_user_id: fallbackUserId,
          });
        }
        return buildDefaultProfile(fallbackUserId);
      }
      throw error;
    }
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
      const remote = await syncProfileFromServer(resolvedUserId, hydrated, {
        force: forceServerRefresh || !cachedProfile,
      });
      if (remote) return remote;

      // Only migrate explicit legacy payloads to server from read path.
      // Do not push default/scaffolded profiles on first read, because that can overwrite
      // existing cloud data from another device before pull completes.
      if (migrated) {
        const operationIds = await queueProfileWrites(resolvedUserId, hydrated);
        await flushProfileWrites(resolvedUserId, operationIds);
        await SafeStorage.set(profileServerSyncMarkerKey(resolvedUserId), true);
        publishUserProfileUpdated(resolvedUserId, 'sync_apply');
      }
    }

    if (allowBackgroundRefresh || forceServerRefresh) {
      const remote = await syncProfileFromServer(resolvedUserId, hydrated, {
        force: forceServerRefresh,
      });
      if (remote) {
        return remote;
      }
    }

    return hydrated;
  },

  /**
   * Create or update user profile in local storage
   */
  async CreateOrUpdateProfile(uid: string, email: string, profileData: UserProfilePatch = {}) {
    try {
      const resolvedUserId = await resolveScopedUserId(uid);
      const now = new Date().toISOString();
      startPhase2SyncRuntime();
      const existing = (await migrateLegacyProfileIfNeeded(resolvedUserId)) || (await loadScopedProfile(resolvedUserId)) || buildDefaultProfile(resolvedUserId);
      const isNew = !existing.createdAt;
      const hasIncomingProfileImage = typeof profileData.profileImage === 'string';
      const profileImageChanged =
        hasIncomingProfileImage && profileData.profileImage !== existing.profileImage;
      const nextProfileImageAssetId = profileData.profileImageAssetId
        ? profileData.profileImageAssetId
        : profileImageChanged
          ? undefined
          : existing.profileImageAssetId;
      const candidateProfile: UserProfile = {
        ...existing,
        uid: resolvedUserId,
        email: email || existing.email,
        ...profileData,
        profileImageAssetId: nextProfileImageAssetId,
        safetyProfile: {
          ...existing.safetyProfile,
          ...(profileData.safetyProfile || {}),
        },
        settings: mergeProfileSettingsPatch(existing.settings, profileData.settings),
      };
      if (isProfileSyncNoop(existing, candidateProfile)) {
        return existing;
      }

      const newProfile: UserProfile = {
        ...candidateProfile,
        updatedAt: now,
        createdAt: isNew ? now : existing.createdAt,
      };

      await saveScopedProfile(resolvedUserId, newProfile);
      publishUserProfileUpdated(resolvedUserId, 'local_write');
      await SafeStorage.set(profileMigrationMarkerKey(resolvedUserId), true);
      const changedEntities = resolveChangedProfileWriteEntities(existing, newProfile);
      if (changedEntities.length > 0) {
        const operationIds = await queueProfileWrites(resolvedUserId, newProfile, changedEntities);
        await flushProfileWrites(resolvedUserId, operationIds);
        await SafeStorage.set(profileServerSyncMarkerKey(resolvedUserId), true);
        publishUserProfileUpdated(resolvedUserId, 'sync_apply');
      }
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
  async updateUserProfile(uid: string, updates: UserProfilePatch) {
    return this.CreateOrUpdateProfile(uid, '', updates);
  },
};
