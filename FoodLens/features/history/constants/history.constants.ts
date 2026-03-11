import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser';

export const getHistoryUserId = (): string => getCurrentUserIdSnapshot();
export const HISTORY_TITLE = 'Food Passport';
