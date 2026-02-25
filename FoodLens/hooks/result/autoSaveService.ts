import { AnalysisService } from '@/services/analysisService_Logic';
import { getAutoSaveUserId } from './autoSaveUtils';

export const autoSaveService = {
  save(params: {
    result: any;
    locationData: any;
    rawImageUri: string | undefined;
    timestamp?: string | null;
  }) {
    return AnalysisService.saveAnalysis(
      getAutoSaveUserId(),
      params.result,
      params.rawImageUri,
      params.locationData,
      params.timestamp || undefined
    );
  },
};
