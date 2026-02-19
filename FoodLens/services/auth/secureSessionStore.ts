import { AuthSessionTokens } from './authApi';

const SESSION_STORAGE_KEY = '@foodlens_auth_session_v1';
const STORAGE_FALLBACK_REQUEST_ID = `auth-secure-store-${Date.now().toString(36)}`;
const STORAGE_FALLBACK_USER_ID = 'unknown';

type SecureStoreModule = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string, options?: Record<string, unknown>) => Promise<void>;
  deleteItemAsync: (key: string, options?: Record<string, unknown>) => Promise<void>;
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY?: string;
};

let secureStoreModule: SecureStoreModule | null = null;
let warnedNativeUnavailable = false;
let volatileSessionJson: string | null = null;

const isNativeModuleUnavailableError = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return message.includes('cannot find native module') || message.includes('securestore');
};

const logNativeUnavailableOnce = (error: unknown): void => {
  if (warnedNativeUnavailable) return;
  warnedNativeUnavailable = true;
  console.warn('[AuthSession] Secure storage native module unavailable; using volatile session fallback.', {
    request_id: STORAGE_FALLBACK_REQUEST_ID,
    user_id: STORAGE_FALLBACK_USER_ID,
    error: error instanceof Error ? error.message : String(error),
  });
};

const getSecureStore = (): SecureStoreModule | null => {
  if (secureStoreModule) return secureStoreModule;

  try {
    secureStoreModule = require('expo-secure-store') as SecureStoreModule;
    return secureStoreModule;
  } catch (error) {
    secureStoreModule = null;
    logNativeUnavailableOnce(error);
    return null;
  }
};

const secureStoreOptions = (): Record<string, unknown> => {
  const module = getSecureStore();
  return {
    keychainService: 'foodlens.auth.tokens',
    ...(module?.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY
      ? { keychainAccessible: module.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY }
      : {}),
  };
};

const parseSession = (raw: string | null): AuthSessionTokens | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as AuthSessionTokens;
    if (!parsed.accessToken || !parsed.refreshToken || !parsed.user?.id || !parsed.expiresIn || !parsed.issuedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

export const AuthSecureSessionStore = {
  async read(): Promise<AuthSessionTokens | null> {
    const secureStore = getSecureStore();
    if (!secureStore) {
      return parseSession(volatileSessionJson);
    }

    try {
      const raw = await secureStore.getItemAsync(SESSION_STORAGE_KEY);
      volatileSessionJson = raw;
      return parseSession(raw);
    } catch (error) {
      if (isNativeModuleUnavailableError(error)) {
        logNativeUnavailableOnce(error);
        return parseSession(volatileSessionJson);
      }
      throw error;
    }
  },

  async write(session: AuthSessionTokens): Promise<void> {
    const serialized = JSON.stringify(session);
    volatileSessionJson = serialized;
    const secureStore = getSecureStore();
    if (!secureStore) {
      return;
    }

    try {
      await secureStore.setItemAsync(SESSION_STORAGE_KEY, serialized, secureStoreOptions());
    } catch (error) {
      if (isNativeModuleUnavailableError(error)) {
        logNativeUnavailableOnce(error);
        return;
      }
      throw error;
    }
  },

  async clear(): Promise<void> {
    volatileSessionJson = null;
    const secureStore = getSecureStore();
    if (!secureStore) {
      return;
    }

    try {
      await secureStore.deleteItemAsync(SESSION_STORAGE_KEY, secureStoreOptions());
    } catch (error) {
      if (isNativeModuleUnavailableError(error)) {
        logNativeUnavailableOnce(error);
        return;
      }
      throw error;
    }
  },
};
