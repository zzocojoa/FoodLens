import { useQuery } from '@tanstack/react-query';
import { AnalysisService, AnalysisRecord } from '@/services/analysisService_Logic';

const HISTORY_QUERY_REFRESH_INTERVAL_MS = 30_000;
const HISTORY_QUERY_REFRESH_JITTER_WINDOW_MS = 3_000;

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
    refetchInterval: () =>
      Math.max(
        1_000,
        HISTORY_QUERY_REFRESH_INTERVAL_MS +
          Math.floor(Math.random() * (HISTORY_QUERY_REFRESH_JITTER_WINDOW_MS * 2 + 1)) -
          HISTORY_QUERY_REFRESH_JITTER_WINDOW_MS
      ),
    refetchIntervalInBackground: false,
  });
};
