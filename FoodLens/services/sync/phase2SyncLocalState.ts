import { SafeStorage } from '@/services/storage';

import type { Phase2SyncOperation } from './phase2Sync.types';

export const PHASE2_SYNC_QUEUE_KEY = '@foodlens_phase2_sync_queue_v1';

type DispatchRunner = () => Promise<void>;

const mediaUploadCooldownUntil = new Map<string, number>();
const settingsDispatchDedupeCache = new Map<
  string,
  {
    payloadKey: string;
    at: number;
    requestId?: string;
  }
>();

let dispatchInFlight: Promise<void> | null = null;

const assertUserId = (userId: string): string => {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error('User id is required to clear Phase 2 sync state.');
  }
  return normalizedUserId;
};

export const mediaCooldownKey = (userId: string, scope: 'profile' | 'history'): string =>
  `${userId}:${scope}`;

export const getPhase2MediaUploadCooldowns = (): Map<string, number> => mediaUploadCooldownUntil;

export const getPhase2SettingsDispatchDedupeCache = (): Map<
  string,
  {
    payloadKey: string;
    at: number;
    requestId?: string;
  }
> => settingsDispatchDedupeCache;

export const resetPhase2SettingsDispatchDedupeForTests = (): void => {
  settingsDispatchDedupeCache.clear();
};

export const clearPhase2RuntimeCaches = (): void => {
  mediaUploadCooldownUntil.clear();
  settingsDispatchDedupeCache.clear();
};

export const runWithPhase2DispatchLock = async (runner: DispatchRunner): Promise<void> => {
  while (dispatchInFlight) {
    await dispatchInFlight;
  }
  dispatchInFlight = runner().finally(() => {
    dispatchInFlight = null;
  });
  await dispatchInFlight;
};

export const loadPhase2SyncQueue = async (): Promise<Phase2SyncOperation[]> =>
  SafeStorage.get<Phase2SyncOperation[]>(PHASE2_SYNC_QUEUE_KEY, []);

export const savePhase2SyncQueue = async (queue: Phase2SyncOperation[]): Promise<void> => {
  await SafeStorage.set(PHASE2_SYNC_QUEUE_KEY, queue);
};

export const clearPhase2SyncQueue = async (): Promise<void> => {
  await runWithPhase2DispatchLock(async () => {
    clearPhase2RuntimeCaches();
    await savePhase2SyncQueue([]);
  });
};

export const clearPhase2SyncQueueForUser = async (userId: string): Promise<void> => {
  const normalizedUserId = assertUserId(userId);
  await runWithPhase2DispatchLock(async () => {
    const queue = await loadPhase2SyncQueue();
    await savePhase2SyncQueue(queue.filter((item) => item.userId !== normalizedUserId));
    mediaUploadCooldownUntil.delete(mediaCooldownKey(normalizedUserId, 'profile'));
    mediaUploadCooldownUntil.delete(mediaCooldownKey(normalizedUserId, 'history'));
    settingsDispatchDedupeCache.delete(normalizedUserId);
  });
};
