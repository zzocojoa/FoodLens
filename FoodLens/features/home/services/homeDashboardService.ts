import { UserProfile } from '../../../models/User';
import { AnalysisService } from '../../../services/analysisService';
import { UserService } from '../../../services/userService';
import { buildWeeklyStats } from '../utils/homeDashboard';

export const fetchHomeDashboardData = async (uid: string) => {
  const [recentData, allHistory, profile] = await Promise.all([
    AnalysisService.getRecentAnalyses(uid, 3),
    AnalysisService.getAllAnalyses(uid),
    UserService.getUserProfile(uid),
  ]);

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

