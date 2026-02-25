import { getCurrentUserId } from '@/services/auth/currentUser_Logic';

export const getTripStatsUserId = (): string => getCurrentUserId();
