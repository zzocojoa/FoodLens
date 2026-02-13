import { AnalysisService } from '@/services/analysisService';
import { TEST_UID } from './autoSaveUtils';

export const autoSaveService = {
  save(params: {
    result: any;
    locationData: any;
    rawImageUri: string | undefined;
    timestamp?: string | null;
  }) {
    return AnalysisService.saveAnalysis(
      TEST_UID,
      params.result,
      params.rawImageUri,
      params.locationData,
      params.timestamp || undefined
    );
  },
};
