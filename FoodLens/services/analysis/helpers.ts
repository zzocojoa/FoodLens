import { AnalysisRecord } from './types';

export const generateId = (): string => {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
};

export const resolveRecordTimestamp = (originalTimestamp?: string): Date => {
  if (originalTimestamp) {
    const parsed = new Date(originalTimestamp);
    if (!isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
};

export const buildAnalysisRecord = (
  data: AnalysisRecord,
  id: string,
  timestamp: Date,
): AnalysisRecord => {
  return {
    ...data,
    id,
    timestamp,
  };
};

