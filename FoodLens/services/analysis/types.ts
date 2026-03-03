import { AnalyzedData } from '../ai';

export const ANALYSES_STORAGE_KEY = '@foodlens_analyses';
export const ANALYSES_STORAGE_KEY_PREFIX = '@foodlens_analyses:';
export const getAnalysesStorageKey = (userId: string): string => `${ANALYSES_STORAGE_KEY_PREFIX}${userId}`;

export interface AnalysisRecord extends AnalyzedData {
  id: string;
  timestamp: Date;
  imageUri?: string;
  imageAssetId?: string;
  imageRenderUrl?: string;
  location?: {
    latitude: number;
    longitude: number;
    country?: string;
    city?: string;
    district?: string;
    subregion?: string;
    formattedAddress?: string;
    isoCountryCode?: string;
  };
}
