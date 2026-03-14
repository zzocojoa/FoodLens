import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AnalysisService } from '@/services/analysisService';
import { historyKeys } from '../queries/useHistoryQuery';
import { AnalyzedData } from '@/services/ai';
import { AnalysisRecord } from '@/services/analysis/types';

/**
 * Hook for saving a new analysis
 */
export const useSaveAnalysisMutation = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: {
      data: AnalyzedData;
      imageUri?: string;
      location?: AnalysisRecord['location'];
      originalTimestamp?: string;
    }) =>
      AnalysisService.saveAnalysis(
        userId,
        params.data,
        params.imageUri,
        params.location,
        params.originalTimestamp
      ),
    onSuccess: () => {
      // Invalidate history to trigger refresh
      queryClient.invalidateQueries({ queryKey: historyKeys.user(userId) });
    },
  });
};

/**
 * Hook for deleting single or multiple analyses
 */
export const useDeleteAnalysisMutation = (userId: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (analysisIds: string[]) => {
      if (analysisIds.length === 1) {
        return AnalysisService.deleteAnalysis(userId, analysisIds[0]);
      }
      return AnalysisService.deleteAnalyses(userId, analysisIds);
    },
    onSuccess: () => {
      // Invalidate history to trigger refresh
      queryClient.invalidateQueries({ queryKey: historyKeys.user(userId) });
    },
  });
};
