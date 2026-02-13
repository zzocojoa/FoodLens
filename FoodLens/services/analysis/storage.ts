import { SafeStorage } from '../storage';
import { ANALYSES_STORAGE_KEY, AnalysisRecord } from './types';

export const getStoredAnalyses = async (): Promise<AnalysisRecord[]> => {
  const analyses = await SafeStorage.get<any[]>(ANALYSES_STORAGE_KEY, []);
  return analyses.map((analysis: any) => ({
    ...analysis,
    timestamp: new Date(analysis.timestamp),
  }));
};

export const saveAnalyses = async (analyses: AnalysisRecord[]): Promise<void> => {
  await SafeStorage.set(ANALYSES_STORAGE_KEY, analyses);
};

