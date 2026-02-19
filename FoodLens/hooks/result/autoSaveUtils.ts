import { getCurrentUserId } from '@/services/auth/currentUser';

export const getAutoSaveUserId = (): string => getCurrentUserId();

export const shouldAutoSaveResult = (
  hasResult: boolean,
  hasSaved: boolean,
  isNew: boolean
) => hasResult && !hasSaved && isNew;
