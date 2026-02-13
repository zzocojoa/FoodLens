export const TEST_UID = 'test-user-v1';

export const shouldAutoSaveResult = (
  hasResult: boolean,
  hasSaved: boolean,
  isNew: string | string[] | undefined
) => hasResult && !hasSaved && isNew === 'true';
