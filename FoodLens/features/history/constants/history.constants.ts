import { getCurrentUserId } from '@/services/auth/currentUser_Logic';

export const getHistoryUserId = (): string => getCurrentUserId();
export const HISTORY_TITLE = 'Food Passport';
