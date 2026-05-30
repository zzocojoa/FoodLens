import { getAiUserId } from './constants';
import { PendingAnalysisJob } from './types';
import { SafeStorage } from '@/services/storage';

const PENDING_ANALYSIS_JOB_KEY_PREFIX = 'foodlens_pending_analysis_job:';

const getPendingAnalysisJobKeyForUser = (userId: string): string => {
  const normalizedUserId = userId.trim();
  if (!normalizedUserId) {
    throw new Error('User id is required to clear a pending analysis job.');
  }
  return `${PENDING_ANALYSIS_JOB_KEY_PREFIX}${normalizedUserId}`;
};

const getPendingAnalysisJobKey = (): string => {
  const userId = getAiUserId() || 'anonymous';
  return getPendingAnalysisJobKeyForUser(userId);
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

export const clearPendingAnalysisJobForUser = async (userId: string): Promise<void> => {
  await SafeStorage.remove(getPendingAnalysisJobKeyForUser(userId));
};

export const clearAllPendingAnalysisJobs = async (): Promise<void> => {
  await SafeStorage.removeByPrefix(PENDING_ANALYSIS_JOB_KEY_PREFIX);
};
