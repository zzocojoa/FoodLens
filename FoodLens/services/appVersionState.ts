import { SafeStorage } from '@/services/storage';
import { getRuntimeAppVersion } from '@/services/runtimeAppVersion';
import { resetReleasePresentationClientState } from '@/services/user/clientStateService';

const APP_VERSION_STATE_KEY_PREFIX = '@foodlens_release_presentation_state_version:';

const buildAppVersionStateKey = (userId: string): string =>
  `${APP_VERSION_STATE_KEY_PREFIX}${userId}`;

export const getCurrentAppVersion = (): string => getRuntimeAppVersion();

export const syncReleasePresentationStateVersion = async (
  userId: string,
  today: Date
): Promise<void> => {
  const storageKey = buildAppVersionStateKey(userId);
  const currentVersion = getCurrentAppVersion();
  const lastVersion = await SafeStorage.get<string | null>(storageKey, null);

  if (lastVersion === currentVersion) {
    return;
  }

  await resetReleasePresentationClientState(userId, today);
  await SafeStorage.set(storageKey, currentVersion);
};
