import { getCurrentUserId } from '@/services/auth/currentUser_Logic';

export const getAutoSaveUserId = (): string => getCurrentUserId();

export const shouldAutoSaveResult = (
  hasResult: boolean,
  hasSaved: boolean,
  isNew: boolean
) => hasResult && !hasSaved && isNew;
