import { useQuery } from '@tanstack/react-query';
import { AnalysisService, AnalysisRecord } from '@/services/analysisService';

const HISTORY_QUERY_REFRESH_INTERVAL_MS = 15_000;

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
    // Keep history screen live-updated while open for cross-device writes.
    staleTime: HISTORY_QUERY_REFRESH_INTERVAL_MS,
    refetchOnMount: 'always',
    refetchInterval: HISTORY_QUERY_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
};
