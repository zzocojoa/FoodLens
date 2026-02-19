import { getCurrentUserId } from '@/services/auth/currentUser';

export const getHistoryUserId = (): string => getCurrentUserId();
export const HISTORY_TITLE = 'Food Passport';
