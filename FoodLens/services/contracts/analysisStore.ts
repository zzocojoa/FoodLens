import type { AnalyzedData } from '@/services/ai';

export type AnalysisStoreLocation =
  | {
      latitude: number;
      longitude: number;
      country?: string;
      city?: string;
      district?: string;
      subregion?: string;
      formattedAddress?: string;
      isoCountryCode?: string;
    }
  | Record<string, unknown>
  | null;

export type AnalysisStoreResult = AnalyzedData;

export type AnalysisStoreSnapshot = {
  result: AnalysisStoreResult | null;
  location: AnalysisStoreLocation | null;
  imageUri: string | null;
  timestamp: string | null;
};

export type AnalysisStoreBackup = {
  result: AnalysisStoreResult;
  location: AnalysisStoreLocation | null;
  imageUri: string | null;
  timestamp: number;
  originalTimestamp: string | null;
};

export type AnalysisStoreNavigableRecord = AnalysisStoreResult & {
  imageUri?: string;
  location?: AnalysisStoreLocation | null;
  timestamp?: string | Date;
};
