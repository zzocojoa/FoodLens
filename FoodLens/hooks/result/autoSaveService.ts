import type { AnalyzedData } from '@/services/ai';
import { AnalysisService } from '@/services/analysisService';
import type { AnalysisRecord } from '@/services/analysis/types';
import { getAutoSaveUserId } from './autoSaveUtils';

type AutoSaveLocation = AnalysisRecord['location'] | Record<string, unknown> | null;

type AutoSaveInput = {
  result: AnalyzedData;
  locationData: AutoSaveLocation;
  rawImageUri: string | undefined;
  timestamp: string | null | undefined;
};

const normalizeLocationData = (locationData: AutoSaveLocation): AnalysisRecord['location'] | undefined => {
  if (!locationData) {
    return undefined;
  }

  if (typeof locationData.latitude !== 'number' || typeof locationData.longitude !== 'number') {
    return undefined;
  }

  return {
    latitude: locationData.latitude,
    longitude: locationData.longitude,
    ...(typeof locationData.country === 'string' ? { country: locationData.country } : {}),
    ...(typeof locationData.city === 'string' ? { city: locationData.city } : {}),
    ...(typeof locationData.district === 'string' ? { district: locationData.district } : {}),
    ...(typeof locationData.subregion === 'string' ? { subregion: locationData.subregion } : {}),
    ...(typeof locationData.formattedAddress === 'string'
      ? { formattedAddress: locationData.formattedAddress }
      : {}),
    ...(typeof locationData.isoCountryCode === 'string'
      ? { isoCountryCode: locationData.isoCountryCode }
      : {}),
  };
};

export const autoSaveService = {
  save(params: AutoSaveInput): Promise<AnalysisRecord> {
    return AnalysisService.saveAnalysis(
      getAutoSaveUserId(),
      params.result,
      params.rawImageUri,
      normalizeLocationData(params.locationData),
      params.timestamp || undefined
    );
  },
};
