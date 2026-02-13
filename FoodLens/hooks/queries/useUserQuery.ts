import { useQuery } from '@tanstack/react-query';
import { UserService } from '@/services/userService';
import { UserProfile } from '@/models/User';

export const userKeys = {
  all: ['user'] as const,
  profile: (uid: string) => [...userKeys.all, uid] as const,
};

/**
 * Hook for fetching user profile
 */
export const useUserQuery = (uid: string) => {
  return useQuery({
    queryKey: userKeys.profile(uid),
    queryFn: () => UserService.getUserProfile(uid),
    staleTime: 1000 * 60 * 10, // 10 minutes
  });
};
