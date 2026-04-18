const mockSafeStorageGet = jest.fn();
const mockSafeStorageSet = jest.fn();
const mockResetReleasePresentationClientState = jest.fn();

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      version: '1.2.3',
    },
    nativeApplicationVersion: '1.2.3-native',
  },
}));

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    get: (...args: unknown[]) => mockSafeStorageGet(...args),
    set: (...args: unknown[]) => mockSafeStorageSet(...args),
  },
}));

jest.mock('@/services/user/clientStateService', () => ({
  resetReleasePresentationClientState: (...args: unknown[]) =>
    mockResetReleasePresentationClientState(...args),
}));

import {
  getCurrentAppVersion,
  syncReleasePresentationStateVersion,
} from '../appVersionState';

describe('appVersionState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSafeStorageGet.mockResolvedValue(null);
    mockSafeStorageSet.mockResolvedValue(undefined);
    mockResetReleasePresentationClientState.mockResolvedValue(undefined);
  });

  it('returns expo config version when available', () => {
    expect(getCurrentAppVersion()).toBe('1.2.3');
  });

  it('resets release presentation state when stored version is missing', async () => {
    const today = new Date('2026-04-18T00:00:00.000Z');

    await syncReleasePresentationStateVersion('usr_1', today);

    expect(mockResetReleasePresentationClientState).toHaveBeenCalledWith('usr_1', today);
    expect(mockSafeStorageSet).toHaveBeenCalledWith(
      '@foodlens_release_presentation_state_version:usr_1',
      '1.2.3'
    );
  });

  it('skips reset when stored version already matches current app version', async () => {
    mockSafeStorageGet.mockResolvedValue('1.2.3');

    await syncReleasePresentationStateVersion('usr_1', new Date('2026-04-18T00:00:00.000Z'));

    expect(mockResetReleasePresentationClientState).not.toHaveBeenCalled();
    expect(mockSafeStorageSet).not.toHaveBeenCalled();
  });
});
