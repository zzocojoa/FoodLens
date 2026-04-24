import { UserProfile } from '../../../models/User';
import { loadUserProfileWithHistory } from '../../../services/user/profileAnalysisLoader';
import { buildWeeklyStats } from '../utils/homeDashboard';

export const fetchHomeDashboardData = async (uid: string) => {
  const { allHistory, profile } = await loadUserProfileWithHistory(uid, {
    allowBackgroundRefresh: false,
  });
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
