import NetInfo from '@react-native-community/netinfo';
import { SafeStorage } from '@/services/storage_Logic';
import { logger } from '@/services/logger_Logic';
import { getCurrentUserId, hasAuthenticatedUser } from '@/services/auth/currentUser_Logic';
import { restoreSession } from '@/services/auth/sessionManager_Logic';
import { Phase2Api, Phase2SyncApiError } from './phase2Api_Logic';
import type {
  Phase2ConflictResolution,
  Phase2SyncEntity,
  Phase2SyncOperation,
} from './phase2Sync.types_Structure';

const SYNC_QUEUE_KEY = '@foodlens_phase2_sync_queue_v1';
const RETRY_LIMIT = 3;
const RETRY_BASE_DELAY_MS = 1_000;
const MAX_SYNCED_HISTORY = 30;

let runtimeStarted = false;
let dispatchInFlight: Promise<void> | null = null;

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

const dispatchOperation = async (operation: Phase2SyncOperation): Promise<{ requestId?: string }> => {
  if (operation.entity === 'profile') {
    const result = await Phase2Api.putProfile(operation.payload as Record<string, string | null>);
    return { requestId: result.requestId };
  }

  if (operation.entity === 'allergies') {
    const result = await Phase2Api.putAllergies(
      operation.payload as {
        allergies?: string[];
        dietary_restrictions?: string[];
        severity_map?: Record<string, string>;
      }
    );
    return { requestId: result.requestId };
  }

  if (operation.entity === 'settings') {
    const result = await Phase2Api.putSettings(
      operation.payload as {
        language?: string | null;
        target_language?: string | null;
        auto_play_audio?: boolean;
        selected_emoji?: string | null;
      }
    );
    return { requestId: result.requestId };
  }

  const historyResult = await Phase2Api.postHistory({
    entry: operation.payload,
    idempotency_key: operation.idempotencyKey,
  });
  return { requestId: historyResult.requestId };
};

const isNetworkAvailable = async (): Promise<boolean> => {
  const state = await NetInfo.fetch();
  if (state.isConnected === false) return false;
  if (state.isInternetReachable === false) return false;
  return true;
};

const withDispatchLock = async (runner: () => Promise<void>): Promise<void> => {
  if (dispatchInFlight) {
    await dispatchInFlight;
    return;
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

export const dispatchPhase2SyncQueue = async (): Promise<void> =>
  withDispatchLock(async () => {
    if (!(await isNetworkAvailable())) return;
    const activeUserId = await resolveActiveUserId();
    if (!activeUserId) return;

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
  void dispatchPhase2SyncQueue();
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

export const getPhase2SyncQueueSnapshot = async (): Promise<Phase2SyncOperation[]> => loadQueue();
