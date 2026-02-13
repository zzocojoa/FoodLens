import { AnalyzedData } from '../ai';

export const ANALYSES_STORAGE_KEY = '@foodlens_analyses';

export interface AnalysisRecord extends AnalyzedData {
  id: string;
  timestamp: Date;
  imageUri?: string;
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

