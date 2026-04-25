import { UserProfile } from '../../../models/User';
import { loadUserProfileWithHistory } from '../../../services/user/profileAnalysisLoader';
import { buildWeeklyStats } from '../utils/homeDashboard';
import { AnalysisRecord } from '@/services/analysis/types';
import { queryClient } from '@/services/queryClient';

const buildHistoryQueryKey = (userId: string): readonly ['history', string] => ['history', userId] as const;

const sortHistoryByRecentTimestamp = (records: readonly AnalysisRecord[]): AnalysisRecord[] => {
  return [...records].sort((left, right) => right.timestamp.getTime() - left.timestamp.getTime());
};

const seedHistoryQueryCache = (uid: string, allHistory: readonly AnalysisRecord[]): void => {
  queryClient.setQueryData(buildHistoryQueryKey(uid), sortHistoryByRecentTimestamp(allHistory));
};

export const fetchHomeDashboardData = async (uid: string) => {
  const { allHistory, profile } = await loadUserProfileWithHistory(uid, {
    allowBackgroundRefresh: false,
  });
  seedHistoryQueryCache(uid, allHistory);
  const recentData = allHistory.slice(0, 3);

  return {
    recentData,
    allHistory,
    profile,
    weeklyStats: buildWeeklyStats(allHistory),
    safeCount: allHistory.filter((item) => item.safetyStatus === 'SAFE').length,
  };
};

export const getProfileRestrictionCount = (profile: UserProfile | null): number => {
  if (!profile) return 0;
  return (
    (profile.safetyProfile.allergies?.length || 0) +
    (profile.safetyProfile.dietaryRestrictions?.length || 0)
  );
};
