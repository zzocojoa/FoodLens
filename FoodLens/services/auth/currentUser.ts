import { SafeStorage } from '@/services/storage';

const CURRENT_USER_STORAGE_KEY = '@foodlens_current_user_id';
const UNAUTHENTICATED_USER_ID = 'auth-required';

let currentUserId: string = UNAUTHENTICATED_USER_ID;

const normalizeUserId = (uid: string | null | undefined): string | null => {
  if (!uid) return null;
  const trimmed = uid.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const getCurrentUserId = (): string => currentUserId;

export const hasAuthenticatedUser = (): boolean => currentUserId !== UNAUTHENTICATED_USER_ID;

export const setCurrentUserId = async (uid: string): Promise<string> => {
  const normalized = normalizeUserId(uid);
  if (!normalized) {
    throw new Error('User id is required to establish an authenticated session.');
  }

  currentUserId = normalized;
  await SafeStorage.set(CURRENT_USER_STORAGE_KEY, normalized);
  return normalized;
};

export const hydrateCurrentUserId = async (): Promise<string | null> => {
  const stored = await SafeStorage.get<string | null>(CURRENT_USER_STORAGE_KEY, null);
  const normalized = normalizeUserId(stored);

  if (!normalized) {
    currentUserId = UNAUTHENTICATED_USER_ID;
    return null;
  }

  currentUserId = normalized;
  return currentUserId;
};

export const clearCurrentUserId = async (): Promise<void> => {
  currentUserId = UNAUTHENTICATED_USER_ID;
  await SafeStorage.remove(CURRENT_USER_STORAGE_KEY);
};
