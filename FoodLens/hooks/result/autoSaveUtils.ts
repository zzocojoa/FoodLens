import { CURRENT_USER_ID } from '@/services/auth/currentUser';

export const TEST_UID = CURRENT_USER_ID;

export const shouldAutoSaveResult = (
  hasResult: boolean,
  hasSaved: boolean,
  isNew: boolean
) => hasResult && !hasSaved && isNew;
