import { getAiUserId } from './constants';
import { PendingAnalysisJob } from './types';
import { SafeStorage } from '@/services/storage';

const PENDING_ANALYSIS_JOB_KEY_PREFIX = 'foodlens_pending_analysis_job:';

const getPendingAnalysisJobKey = (): string => {
  const userId = getAiUserId() || 'anonymous';
  return `${PENDING_ANALYSIS_JOB_KEY_PREFIX}${userId}`;
};

export const loadPendingAnalysisJob = async (): Promise<PendingAnalysisJob | null> => {
  return SafeStorage.get<PendingAnalysisJob | null>(getPendingAnalysisJobKey(), null);
};

export const savePendingAnalysisJob = async (job: PendingAnalysisJob): Promise<void> => {
  await SafeStorage.set(getPendingAnalysisJobKey(), job);
};

export const clearPendingAnalysisJob = async (): Promise<void> => {
  await SafeStorage.remove(getPendingAnalysisJobKey());
};
