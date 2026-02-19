import { getCurrentUserId } from '@/services/auth/currentUser';

export const getTripStatsUserId = (): string => getCurrentUserId();
