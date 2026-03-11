import { SafeStorage } from '../storage';
import { ANALYSES_STORAGE_KEY, AnalysisRecord, getAnalysesStorageKey } from './types';

const normalizeAnalyses = (records: unknown[]): AnalysisRecord[] =>
  records.map((analysis) => {
    const item = analysis as Record<string, unknown>;
    const rawTimestamp = item['timestamp'];
    const timestamp = rawTimestamp instanceof Date ? rawTimestamp : new Date(String(rawTimestamp || ''));
    return {
      ...(analysis as AnalysisRecord),
      timestamp: Number.isNaN(timestamp.getTime()) ? new Date() : timestamp,
    };
  });

const migrateLegacyAnalysesIfNeeded = async (userId: string): Promise<AnalysisRecord[]> => {
  const scopedKey = getAnalysesStorageKey(userId);
  const existing = await SafeStorage.get<unknown[]>(scopedKey, []);
  if (existing.length > 0) {
    return normalizeAnalyses(existing);
  }

  const legacy = await SafeStorage.get<unknown[]>(ANALYSES_STORAGE_KEY, []);
  if (legacy.length === 0) {
    return [];
  }

  const normalized = normalizeAnalyses(legacy);
  await SafeStorage.set(scopedKey, normalized);
  await SafeStorage.remove(ANALYSES_STORAGE_KEY);
  return normalized;
};

export const getStoredAnalyses = async (userId: string): Promise<AnalysisRecord[]> => {
  const scopedKey = getAnalysesStorageKey(userId);
  const analyses = await SafeStorage.get<unknown[]>(scopedKey, []);
  if (analyses.length > 0) {
    return normalizeAnalyses(analyses);
  }
  return migrateLegacyAnalysesIfNeeded(userId);
};

export const saveAnalyses = async (userId: string, analyses: AnalysisRecord[]): Promise<void> => {
  await SafeStorage.set(getAnalysesStorageKey(userId), analyses);
};
