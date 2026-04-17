import { AnalysisRecord } from '../../../services/analysisService';

export type HomeStatusVariant = 'SAFE' | 'CAUTION' | 'DANGER' | 'EMPTY';
export type HomeStatusSignal = 'SAFE' | 'CAUTION' | 'DANGER';

export type HomeStatusCounts = {
  safe: number;
  caution: number;
  danger: number;
  total: number;
};

export const countHomeStatusSignals = (
  records: AnalysisRecord[]
): HomeStatusCounts => {
  return records.reduce<HomeStatusCounts>(
    (counts, record) => {
      if (record.safetyStatus === 'SAFE') {
        return {
          ...counts,
          safe: counts.safe + 1,
          total: counts.total + 1,
        };
      }

      if (record.safetyStatus === 'DANGER') {
        return {
          ...counts,
          danger: counts.danger + 1,
          total: counts.total + 1,
        };
      }

      return {
        ...counts,
        caution: counts.caution + 1,
        total: counts.total + 1,
      };
    },
    {
      safe: 0,
      caution: 0,
      danger: 0,
      total: 0,
    }
  );
};

export const resolveHomeStatusVariant = (
  counts: HomeStatusCounts
): HomeStatusVariant => {
  if (counts.total === 0) {
    return 'EMPTY';
  }

  if (counts.danger > 0) {
    return 'DANGER';
  }

  if (counts.caution > 0) {
    return 'CAUTION';
  }

  return 'SAFE';
};

export const filterScansByHomeStatusSignal = (
  records: AnalysisRecord[],
  signal: HomeStatusSignal | null
): AnalysisRecord[] => {
  if (signal === null) {
    return records;
  }

  return records.filter((record) => record.safetyStatus === signal);
};
