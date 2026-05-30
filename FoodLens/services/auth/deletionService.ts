import { SafeStorage } from '@/services/storage';
import { clearAiCache } from '@/services/aiCore/cache';
import { clearInflightBarcodeLookups } from '@/services/aiCore/internal/barcodeLookup';
import { BarcodeCache } from '@/services/aiCore/internal/barcodeCache';
import { clearAllPendingAnalysisJobs } from '@/services/aiCore/pendingAnalysisStore';
import { dataStore } from '@/services/dataStore';
import { clearManagedImageDirectory } from '@/services/imageStorage';
import { clearPhase2SyncQueue } from '@/services/sync/phase2SyncQueue';
import {
  AuthApi,
  AuthApiError,
  AuthDeletionRequest,
  AuthDeletionRequestTarget,
  AuthSessionTokens,
} from './authApi';
import { clearSession, restoreSession } from './sessionManager';

const locallySubmittedDeletionRequestIds: Set<string> = new Set();

type LocalWipeTask = {
  name: string;
  run: () => Promise<void>;
};

type LocalWipeFailure = {
  name: string;
  error: unknown;
};

const runLocalWipeTasks = async (tasks: LocalWipeTask[]): Promise<void> => {
  const failures: LocalWipeFailure[] = [];

  for (const task of tasks) {
    try {
      await task.run();
    } catch (error) {
      failures.push({
        name: task.name,
        error,
      });
    }
  }

  if (failures.length > 0) {
    console.error('[DeletionService] Local deletion footprint wipe failed', {
      failedTasks: failures.map((failure) => failure.name),
      errors: failures.map((failure) => ({
        task: failure.name,
        error: failure.error instanceof Error ? failure.error.message : String(failure.error),
      })),
    });
    throw new Error(`Local deletion footprint wipe failed: ${failures.map((failure) => failure.name).join(', ')}`);
  }
};

const restoreAuthenticatedSession = async (): Promise<AuthSessionTokens> => {
  const session = await restoreSession({
    clearCurrentUserOnMissing: false,
    logWarnings: false,
    refreshIfExpired: true,
  });

  if (!session?.accessToken) {
    throw new AuthApiError('Active session is required.', 'AUTH_SESSION_REQUIRED', 401);
  }

  return session;
};

const rememberLocallySubmittedDeletionRequest = (
  deletionRequest: AuthDeletionRequest
): AuthDeletionRequest => {
  if (deletionRequest.requestId) {
    locallySubmittedDeletionRequestIds.add(deletionRequest.requestId);
  }
  return deletionRequest;
};

export const getLatestDeletionRequest = async (): Promise<AuthDeletionRequest | null> => {
  const session = await restoreAuthenticatedSession();
  return AuthApi.getLatestDeletionRequest({
    accessToken: session.accessToken,
  });
};

export const createDeletionRequest = async (
  target: AuthDeletionRequestTarget
): Promise<AuthDeletionRequest> => {
  const session = await restoreAuthenticatedSession();
  const deletionRequest = await AuthApi.createDeletionRequest({
    accessToken: session.accessToken,
    target,
  });
  return rememberLocallySubmittedDeletionRequest(deletionRequest);
};

export const consumeDeletionRequestFinalization = (
  deletionRequest: AuthDeletionRequest | null
): boolean => {
  if (!deletionRequest) {
    return false;
  }

  if (deletionRequest.status !== 'done') {
    return false;
  }

  if (!deletionRequest.requestId || !locallySubmittedDeletionRequestIds.has(deletionRequest.requestId)) {
    return false;
  }

  locallySubmittedDeletionRequestIds.delete(deletionRequest.requestId);
  return true;
};

export const clearLocalDeletionFootprint = async (): Promise<void> => {
  locallySubmittedDeletionRequestIds.clear();
  clearInflightBarcodeLookups();
  await runLocalWipeTasks([
    {
      name: 'clearSession',
      run: clearSession,
    },
    {
      name: 'dataStore.clear',
      run: () => dataStore.clear(),
    },
    {
      name: 'clearAllPendingAnalysisJobs',
      run: clearAllPendingAnalysisJobs,
    },
    {
      name: 'clearAiCache',
      run: clearAiCache,
    },
    {
      name: 'BarcodeCache.clear',
      run: () => BarcodeCache.clear(),
    },
    {
      name: 'clearPhase2SyncQueue',
      run: clearPhase2SyncQueue,
    },
    {
      name: 'clearManagedImageDirectory',
      run: clearManagedImageDirectory,
    },
    {
      name: 'SafeStorage.clearAll',
      run: () => SafeStorage.clearAll(),
    },
  ]);
};
