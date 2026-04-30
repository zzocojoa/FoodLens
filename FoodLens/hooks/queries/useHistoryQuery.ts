import { useQuery } from '@tanstack/react-query';
import { AnalysisService, AnalysisRecord } from '@/services/analysisService';
import { markHomeNavigationTrace } from '@/features/home/services/homeNavigationTrace';

export const HISTORY_QUERY_REFRESH_INTERVAL_MS = 15_000;

export const historyKeys = {
  all: ['history'] as const,
  user: (userId: string) => [...historyKeys.all, userId] as const,
};

type UseHistoryQueryOptions = {
  isPollingEnabled: boolean;
};

/**
 * Hook for fetching all analysis records
 */
export const useHistoryQuery = (userId: string, options: UseHistoryQueryOptions) => {
  const { isPollingEnabled } = options;

  return useQuery({
    queryKey: historyKeys.user(userId),
    queryFn: async (): Promise<AnalysisRecord[]> => {
      markHomeNavigationTrace('history', 'async_load_start');
      try {
        const records = await AnalysisService.getAllAnalyses(userId);
        return [...records].sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      } finally {
        markHomeNavigationTrace('history', 'async_load_end');
      }
    },
    staleTime: HISTORY_QUERY_REFRESH_INTERVAL_MS,
    refetchOnMount: isPollingEnabled,
    refetchInterval: false,
    refetchIntervalInBackground: false,
  });
};
