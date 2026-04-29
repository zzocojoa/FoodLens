const loadIsolatedAuthSecureSessionStore = (): typeof import('../secureSessionStore').AuthSecureSessionStore => {
  let loadedModule: typeof import('../secureSessionStore') | null = null;

  jest.isolateModules(() => {
    loadedModule = require('../secureSessionStore') as typeof import('../secureSessionStore');
  });

  if (!loadedModule) {
    throw new Error('secureSessionStore module failed to load in isolateModules');
  }

  const resolvedModule = loadedModule as typeof import('../secureSessionStore');
  return resolvedModule.AuthSecureSessionStore;
};

const createSession = (): import('../authApi').AuthSessionTokens => ({
  accessToken: 'access-token',
  refreshToken: 'refresh-token',
  expiresIn: 3600,
  issuedAt: 1_700_000_000_000,
  user: {
    id: 'usr_google',
    email: 'google@example.com',
    provider: 'google',
  },
});

const IOS_MISSING_ENTITLEMENT_MESSAGE =
  "Calling the 'getValueWithKeyAsync' function has failed\n\u2192 Caused by: A required entitlement isn't present.";

describe('AuthSecureSessionStore regression', () => {
  beforeEach(() => {
    jest.resetModules();
  });

  it('falls back when the web secure-store shim misses getValueWithKeyAsync', async () => {
    jest.doMock('expo-secure-store', () => ({
      getItemAsync: jest.fn().mockRejectedValue(new Error('n.default.getValueWithKeyAsync is not a function')),
      setItemAsync: jest.fn(),
      deleteItemAsync: jest.fn(),
    }));

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const AuthSecureSessionStore = loadIsolatedAuthSecureSessionStore();

    await expect(AuthSecureSessionStore.read()).resolves.toBeNull();

    expect(warnSpy).toHaveBeenCalledWith(
      '[AuthSession] Secure storage native module unavailable; using volatile session fallback.',
      expect.objectContaining({
        error: 'n.default.getValueWithKeyAsync is not a function',
      }),
    );

    warnSpy.mockRestore();
  });

  it('keeps the volatile session when iOS simulator keychain entitlements are unavailable', async () => {
    jest.doMock('expo-secure-store', () => ({
      getItemAsync: jest.fn().mockResolvedValue(null),
      setItemAsync: jest
        .fn()
        .mockRejectedValue(
          new Error(
            'Error Domain=NSOSStatusErrorDomain Code=-34018 "Client has neither application-identifier nor keychain-access-groups entitlements"',
          ),
        ),
      deleteItemAsync: jest.fn(),
      AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY',
    }));

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const AuthSecureSessionStore = loadIsolatedAuthSecureSessionStore();
    const session = createSession();

    await expect(AuthSecureSessionStore.write(session)).resolves.toBeUndefined();
    await expect(AuthSecureSessionStore.read()).resolves.toEqual(session);

    expect(warnSpy).toHaveBeenCalledWith(
      '[AuthSession] Secure storage native module unavailable; using volatile session fallback.',
      expect.objectContaining({
        error:
          'Error Domain=NSOSStatusErrorDomain Code=-34018 "Client has neither application-identifier nor keychain-access-groups entitlements"',
      }),
    );

    warnSpy.mockRestore();
  });

  it('falls back when iOS reports a missing required entitlement', async () => {
    jest.doMock('expo-secure-store', () => ({
      getItemAsync: jest.fn().mockRejectedValue(new Error(IOS_MISSING_ENTITLEMENT_MESSAGE)),
      setItemAsync: jest.fn(),
      deleteItemAsync: jest.fn(),
    }));

    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const AuthSecureSessionStore = loadIsolatedAuthSecureSessionStore();

    await expect(AuthSecureSessionStore.read()).resolves.toBeNull();

    expect(warnSpy).toHaveBeenCalledWith(
      '[AuthSession] Secure storage native module unavailable; using volatile session fallback.',
      expect.objectContaining({
        error: IOS_MISSING_ENTITLEMENT_MESSAGE,
      }),
    );

    warnSpy.mockRestore();
  });
});
