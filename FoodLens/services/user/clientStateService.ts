import type {
  SyncedClientState,
  SyncedHistoryFilter,
  SyncedHistoryMode,
  SyncedMapRegion,
  UserProfile,
} from '@/models/User';
import { logger } from '@/services/logger';
import { SafeStorage } from '@/services/storage';
import {
  dispatchPhase2SyncQueue,
  enqueuePhase2Sync,
  startPhase2SyncRuntime,
} from '@/services/sync/phase2SyncQueue';
import { buildProfileWritePayload } from '@/services/sync/phase2Mappers';
import {
  fromLocalDateString,
  mergeSyncedClientState,
  normalizeSyncedClientState,
  toLocalDateString,
} from '@/services/sync/clientState';
import { publishUserProfileUpdated } from './userProfileStore';
import { buildDefaultProfile } from './profileFactory';
import { getUserStorageKey } from './constants';

const DEFAULT_HISTORY_MODE: SyncedHistoryMode = 'list';
const DEFAULT_HISTORY_FILTER: SyncedHistoryFilter = 'all';

const loadProfileSnapshotSync = (userId: string): UserProfile => {
  const scoped = SafeStorage.getSync<UserProfile | null>(getUserStorageKey(userId), null);
  if (scoped) return scoped;
  return buildDefaultProfile(userId);
};

const loadProfileSnapshot = async (userId: string): Promise<UserProfile> => {
  const scoped = await SafeStorage.get<UserProfile | null>(getUserStorageKey(userId), null);
  if (scoped) return scoped;
  return buildDefaultProfile(userId);
};

const saveProfileSnapshot = async (userId: string, profile: UserProfile): Promise<void> => {
  await SafeStorage.set(getUserStorageKey(userId), profile);
};

export const readUserClientStateSnapshot = (userId: string): SyncedClientState => {
  const profile = loadProfileSnapshotSync(userId);
  return normalizeSyncedClientState(profile.settings.clientState);
};

export const readHomeSelectedDateSnapshot = (userId: string): Date | null => {
  const clientState = readUserClientStateSnapshot(userId);
  return fromLocalDateString(clientState.home?.selectedDate);
};

export const readHistoryStateSnapshot = (
  userId: string
): {
  archiveMode: SyncedHistoryMode;
  filter: SyncedHistoryFilter;
  mapRegion: SyncedMapRegion | null;
} => {
  const clientState = readUserClientStateSnapshot(userId);
  return {
    archiveMode: clientState.history?.archiveMode || DEFAULT_HISTORY_MODE,
    filter: clientState.history?.filter || DEFAULT_HISTORY_FILTER,
    mapRegion:
      Object.prototype.hasOwnProperty.call(clientState.history || {}, 'mapRegion')
        ? clientState.history?.mapRegion || null
        : null,
  };
};

export const updateUserClientState = async (
  userId: string,
  patch: Partial<SyncedClientState>
): Promise<UserProfile> => {
  const profile = await loadProfileSnapshot(userId);
  const nextClientState = mergeSyncedClientState(profile.settings.clientState, patch);
  const currentComparable = JSON.stringify(normalizeSyncedClientState(profile.settings.clientState));
  const nextComparable = JSON.stringify(nextClientState);
  if (currentComparable === nextComparable) {
    return profile;
  }

  const nextProfile: UserProfile = {
    ...profile,
    updatedAt: new Date().toISOString(),
    settings: {
      ...profile.settings,
      clientState: nextClientState,
    },
  };
  await saveProfileSnapshot(userId, nextProfile);
  publishUserProfileUpdated(userId, 'local_write');

  startPhase2SyncRuntime();
  const payload = buildProfileWritePayload(nextProfile).settings as Record<string, unknown>;
  await enqueuePhase2Sync(userId, 'settings', payload);
  try {
    await dispatchPhase2SyncQueue();
  } catch (error) {
    logger.warn('[Phase2Sync] client_state flush deferred', {
      request_id: 'unknown',
      user_id: userId,
      code: error instanceof Error ? error.message : 'PHASE2_CLIENT_STATE_FLUSH_DEFERRED',
    });
  }
  return nextProfile;
};

export const buildHomeSelectedDatePatch = (date: Date): Partial<SyncedClientState> => ({
  home: {
    selectedDate: toLocalDateString(date),
  },
});

export const buildOnboardingCompletedPatch = (completedAt: string): Partial<SyncedClientState> => ({
  onboarding: {
    completedAt,
  },
});

export const buildHistoryModePatch = (
  archiveMode: SyncedHistoryMode
): Partial<SyncedClientState> => ({
  history: {
    archiveMode,
  },
});

export const buildHistoryFilterPatch = (
  filter: SyncedHistoryFilter
): Partial<SyncedClientState> => ({
  history: {
    filter,
  },
});

export const buildHistoryMapRegionPatch = (
  mapRegion: SyncedMapRegion | null
): Partial<SyncedClientState> => ({
  history: {
    mapRegion,
  },
});
