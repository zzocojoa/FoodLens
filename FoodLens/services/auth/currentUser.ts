import { SafeStorage } from '@/services/storage';

const CURRENT_USER_STORAGE_KEY = '@foodlens_current_user_id';
const FALLBACK_USER_ID = 'anonymous-user';

let currentUserId: string = FALLBACK_USER_ID;

const normalizeUserId = (uid: string): string => {
  const trimmed = uid.trim();
  return trimmed.length > 0 ? trimmed : FALLBACK_USER_ID;
};

export const getCurrentUserId = (): string => currentUserId;

export const setCurrentUserId = async (uid: string): Promise<string> => {
  const normalized = normalizeUserId(uid);
  currentUserId = normalized;
  await SafeStorage.set(CURRENT_USER_STORAGE_KEY, normalized);
  return normalized;
};

export const hydrateCurrentUserId = async (fallbackUid?: string): Promise<string> => {
  const stored = await SafeStorage.get<string | null>(CURRENT_USER_STORAGE_KEY, null);
  if (stored) {
    currentUserId = normalizeUserId(stored);
    return currentUserId;
  }

  if (fallbackUid) {
    return setCurrentUserId(fallbackUid);
  }

  currentUserId = FALLBACK_USER_ID;
  return currentUserId;
};

export const clearCurrentUserId = async (): Promise<void> => {
  currentUserId = FALLBACK_USER_ID;
  await SafeStorage.remove(CURRENT_USER_STORAGE_KEY);
};

