import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser_Logic';

export const getAutoSaveUserId = (): string => getCurrentUserIdSnapshot();

export const shouldAutoSaveResult = (
  hasResult: boolean,
  hasSaved: boolean,
  isNew: boolean
) => hasResult && !hasSaved && isNew;
