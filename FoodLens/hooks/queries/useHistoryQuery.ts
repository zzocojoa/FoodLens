import { useQuery } from '@tanstack/react-query';
import { AnalysisService, AnalysisRecord } from '@/services/analysisService';

export const historyKeys = {
  all: ['history'] as const,
  user: (userId: string) => [...historyKeys.all, userId] as const,
};

/**
 * Hook for fetching all analysis records
 */
export const useHistoryQuery = (userId: string) => {
  return useQuery({
    queryKey: historyKeys.user(userId),
    queryFn: async (): Promise<AnalysisRecord[]> => {
      const records = await AnalysisService.getAllAnalyses(userId);
      // Sort by timestamp descending
      return records.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    },
    // Keep data fresh for 1 minute
    staleTime: 1000 * 60,
  });
};
