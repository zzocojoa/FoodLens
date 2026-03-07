import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser_Logic';

export const getHistoryUserId = (): string => getCurrentUserIdSnapshot();
export const HISTORY_TITLE = 'Food Passport';
