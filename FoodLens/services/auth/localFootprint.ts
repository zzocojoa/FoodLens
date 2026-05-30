import { clearAiCache } from '@/services/aiCore/cache';
import { BarcodeCache } from '@/services/aiCore/internal/barcodeCache';
import { clearInflightBarcodeLookups } from '@/services/aiCore/internal/barcodeLookup';
import { clearAllPendingAnalysisJobs } from '@/services/aiCore/pendingAnalysisStore';
import { dataStore } from '@/services/dataStore';
import { clearManagedImageDirectory } from '@/services/imageStorage';
import { SafeStorage } from '@/services/storage';
import { clearPhase2SyncQueue } from '@/services/sync/phase2SyncLocalState';

import { clearSession } from './sessionManager';

type LocalPrivacyFootprintWipeReason = 'account_deletion' | 'logout';

type LocalPrivacyFootprintTask = {
  name: string;
  run: () => Promise<void>;
};

type LocalPrivacyFootprintFailure = {
  name: string;
  error: unknown;
};

const runLocalPrivacyFootprintTasks = async (
  reason: LocalPrivacyFootprintWipeReason,
  tasks: LocalPrivacyFootprintTask[]
): Promise<void> => {
  const failures: LocalPrivacyFootprintFailure[] = [];

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
    console.error('[LocalFootprint] Local privacy footprint wipe failed', {
      reason,
      failedTasks: failures.map((failure) => failure.name),
      errors: failures.map((failure) => ({
        task: failure.name,
        error: failure.error instanceof Error ? failure.error.message : String(failure.error),
      })),
    });
    throw new Error(
      `Local privacy footprint wipe failed (${reason}): ${failures
        .map((failure) => failure.name)
        .join(', ')}`
    );
  }
};

const clearLocalPrivacyFootprint = async (
  reason: LocalPrivacyFootprintWipeReason
): Promise<void> => {
  clearInflightBarcodeLookups();
  await runLocalPrivacyFootprintTasks(reason, [
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

export const clearLocalDeletionPrivacyFootprint = async (): Promise<void> => {
  await clearLocalPrivacyFootprint('account_deletion');
};

export const clearLocalLogoutFootprint = async (): Promise<void> => {
  await clearLocalPrivacyFootprint('logout');
};
