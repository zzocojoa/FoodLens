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
});
