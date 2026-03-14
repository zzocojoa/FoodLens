import { UserProfile } from '@/models/User';
import { AnalysisRecord, AnalysisService } from '@/services/analysisService';
import { UserService } from '@/services/userService';

type LoadUserProfileWithHistoryOptions = {
  allowBackgroundRefresh?: boolean;
};

export type UserProfileAnalysisSnapshot = {
  allHistory: AnalysisRecord[];
  profile: UserProfile | null;
};

export const loadUserProfileWithHistory = async (
  userId: string,
  options: LoadUserProfileWithHistoryOptions = {}
): Promise<UserProfileAnalysisSnapshot> => {
  const { allowBackgroundRefresh = true } = options;
  const [profile, allHistory] = await Promise.all([
    UserService.getUserProfile(userId, { allowBackgroundRefresh }),
    AnalysisService.getAllAnalyses(userId),
  ]);

  return {
    allHistory,
    profile,
  };
};
