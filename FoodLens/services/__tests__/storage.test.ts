type AsyncStorageMock = {
  getItem: jest.Mock;
  setItem: jest.Mock;
  removeItem: jest.Mock;
  getAllKeys: jest.Mock;
  multiGet: jest.Mock;
  multiRemove: jest.Mock;
  clear: jest.Mock;
};

type MmkvInstanceMock = {
  getBoolean: jest.Mock;
  getString: jest.Mock;
  set: jest.Mock;
  delete: jest.Mock;
  clearAll: jest.Mock;
  getAllKeys: jest.Mock;
};

const createAsyncStorageMock = (): AsyncStorageMock => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  getAllKeys: jest.fn(async () => []),
  multiGet: jest.fn(async () => []),
  multiRemove: jest.fn(async () => undefined),
  clear: jest.fn(async () => undefined),
});

const createMmkvInstanceMock = (): MmkvInstanceMock => ({
  getBoolean: jest.fn(() => false),
  getString: jest.fn(),
  set: jest.fn(),
  delete: jest.fn(),
  clearAll: jest.fn(),
  getAllKeys: jest.fn(() => []),
});

const loadStorageModule = (
  mmkvFactory: () => MmkvInstanceMock
): {
  asyncStorage: AsyncStorageMock;
  getMmkvInstance: () => MmkvInstanceMock | null;
  SafeStorage: typeof import('../storage').SafeStorage;
  initializeSafeStorage: typeof import('../storage').initializeSafeStorage;
} => {
  jest.resetModules();
  const asyncStorage = createAsyncStorageMock();
  let mmkvInstance: MmkvInstanceMock | null = null;
  const mmkvConstructor = jest.fn(() => {
    mmkvInstance = mmkvFactory();
    return mmkvInstance;
  });

  jest.doMock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: asyncStorage,
  }));
  jest.doMock('react-native-mmkv', () => ({
    MMKV: mmkvConstructor,
  }));

  const storageModule = require('../storage') as typeof import('../storage');
  return {
    asyncStorage,
    getMmkvInstance: () => mmkvInstance,
    SafeStorage: storageModule.SafeStorage,
    initializeSafeStorage: storageModule.initializeSafeStorage,
  };
};

describe('SafeStorage', () => {
  afterEach(() => {
    jest.dontMock('@react-native-async-storage/async-storage');
    jest.dontMock('react-native-mmkv');
  });

  it('clears MMKV and AsyncStorage when MMKV is active', async () => {
    const { asyncStorage, getMmkvInstance, SafeStorage } = loadStorageModule(createMmkvInstanceMock);

    await SafeStorage.clearAll();

    expect(getMmkvInstance()?.clearAll).toHaveBeenCalledTimes(1);
    expect(asyncStorage.clear).toHaveBeenCalledTimes(1);
  });

  it('clears AsyncStorage when MMKV is unavailable', async () => {
    const { asyncStorage, SafeStorage } = loadStorageModule(() => {
      throw new Error('MMKV unavailable');
    });

    await SafeStorage.clearAll();

    expect(asyncStorage.clear).toHaveBeenCalledTimes(1);
  });

  it('still clears AsyncStorage and rejects when MMKV clear fails', async () => {
    const { asyncStorage, getMmkvInstance, SafeStorage } = loadStorageModule(() => {
      const instance = createMmkvInstanceMock();
      instance.clearAll.mockImplementation(() => {
        throw new Error('MMKV clear failed');
      });
      return instance;
    });

    await expect(SafeStorage.clearAll()).rejects.toThrow('mmkv');

    expect(getMmkvInstance()?.clearAll).toHaveBeenCalledTimes(1);
    expect(asyncStorage.clear).toHaveBeenCalledTimes(1);
  });

  it('rejects when AsyncStorage clear fails', async () => {
    const { asyncStorage, SafeStorage } = loadStorageModule(createMmkvInstanceMock);
    asyncStorage.clear.mockRejectedValue(new Error('AsyncStorage clear failed'));

    await expect(SafeStorage.clearAll()).rejects.toThrow('async_storage');
  });

  it('lists keys from MMKV and AsyncStorage without duplicates', async () => {
    const mmkvInstance = createMmkvInstanceMock();
    const { asyncStorage, SafeStorage } = loadStorageModule(() => mmkvInstance);
    mmkvInstance.getAllKeys.mockReturnValue(['@foodlens_user_profile', '@foodlens_analyses:usr_a']);
    asyncStorage.getAllKeys.mockResolvedValue(['@foodlens_user_profile', '@foodlens_analyses:usr_b']);

    await expect(SafeStorage.getAllKeys()).resolves.toEqual([
      '@foodlens_user_profile',
      '@foodlens_analyses:usr_a',
      '@foodlens_analyses:usr_b',
    ]);
  });

  it('migrates legacy AsyncStorage keys into MMKV', async () => {
    const { asyncStorage, getMmkvInstance, initializeSafeStorage } = loadStorageModule(createMmkvInstanceMock);
    asyncStorage.getAllKeys.mockResolvedValue(['@foodlens_user_profile']);
    asyncStorage.multiGet.mockResolvedValue([['@foodlens_user_profile', '{"uid":"usr_a"}']]);

    await initializeSafeStorage();

    expect(getMmkvInstance()?.set).toHaveBeenCalledWith('@foodlens_user_profile', '{"uid":"usr_a"}');
  });
});
