import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser';

export const getAutoSaveUserId = (): string => getCurrentUserIdSnapshot();

export const shouldAutoSaveResult = (
  hasResult: boolean,
  hasSaved: boolean,
  isNew: boolean
) => hasResult && !hasSaved && isNew;
