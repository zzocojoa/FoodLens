import {
  clearLocalDeletionPrivacyFootprint,
  clearLocalLogoutFootprint,
} from '../localFootprint';

const mockClearSession = jest.fn();
const mockClearAll = jest.fn();
const mockDataStoreClear = jest.fn();
const mockClearManagedImageDirectory = jest.fn();
const mockClearAllPendingAnalysisJobs = jest.fn();
const mockClearAiCache = jest.fn();
const mockClearPhase2SyncQueue = jest.fn();
const mockClearInflightBarcodeLookups = jest.fn();
const mockBarcodeCacheClear = jest.fn();

jest.mock('../sessionManager', () => ({
  clearSession: (...args: unknown[]) => mockClearSession(...args),
}));

jest.mock('@/services/storage', () => ({
  SafeStorage: {
    clearAll: (...args: unknown[]) => mockClearAll(...args),
  },
}));

jest.mock('@/services/dataStore', () => ({
  dataStore: {
    clear: (...args: unknown[]) => mockDataStoreClear(...args),
  },
}));

jest.mock('@/services/imageStorage', () => ({
  clearManagedImageDirectory: (...args: unknown[]) => mockClearManagedImageDirectory(...args),
}));

jest.mock('@/services/aiCore/pendingAnalysisStore', () => ({
  clearAllPendingAnalysisJobs: (...args: unknown[]) => mockClearAllPendingAnalysisJobs(...args),
}));

jest.mock('@/services/aiCore/cache', () => ({
  clearAiCache: (...args: unknown[]) => mockClearAiCache(...args),
}));

jest.mock('@/services/aiCore/internal/barcodeLookup', () => ({
  clearInflightBarcodeLookups: (...args: unknown[]) => mockClearInflightBarcodeLookups(...args),
}));

jest.mock('@/services/aiCore/internal/barcodeCache', () => ({
  BarcodeCache: {
    clear: (...args: unknown[]) => mockBarcodeCacheClear(...args),
  },
}));

jest.mock('@/services/sync/phase2SyncLocalState', () => ({
  clearPhase2SyncQueue: (...args: unknown[]) => mockClearPhase2SyncQueue(...args),
}));

describe('localFootprint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockClearSession.mockResolvedValue(undefined);
    mockClearAll.mockResolvedValue(undefined);
    mockDataStoreClear.mockResolvedValue(undefined);
    mockClearManagedImageDirectory.mockResolvedValue(undefined);
    mockClearAllPendingAnalysisJobs.mockResolvedValue(undefined);
    mockClearAiCache.mockResolvedValue(undefined);
    mockClearPhase2SyncQueue.mockResolvedValue(undefined);
    mockBarcodeCacheClear.mockResolvedValue(undefined);
  });

  it('clears all local deletion privacy footprint stores', async () => {
    await clearLocalDeletionPrivacyFootprint();

    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(mockDataStoreClear).toHaveBeenCalledTimes(1);
    expect(mockClearManagedImageDirectory).toHaveBeenCalledTimes(1);
    expect(mockClearAllPendingAnalysisJobs).toHaveBeenCalledTimes(1);
    expect(mockClearAiCache).toHaveBeenCalledTimes(1);
    expect(mockBarcodeCacheClear).toHaveBeenCalledTimes(1);
    expect(mockClearPhase2SyncQueue).toHaveBeenCalledTimes(1);
    expect(mockClearInflightBarcodeLookups).toHaveBeenCalledTimes(1);
    expect(mockClearAll).toHaveBeenCalledTimes(1);
  });

  it('clears all local logout privacy footprint stores', async () => {
    await clearLocalLogoutFootprint();

    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(mockDataStoreClear).toHaveBeenCalledTimes(1);
    expect(mockClearManagedImageDirectory).toHaveBeenCalledTimes(1);
    expect(mockClearAllPendingAnalysisJobs).toHaveBeenCalledTimes(1);
    expect(mockClearAiCache).toHaveBeenCalledTimes(1);
    expect(mockBarcodeCacheClear).toHaveBeenCalledTimes(1);
    expect(mockClearPhase2SyncQueue).toHaveBeenCalledTimes(1);
    expect(mockClearInflightBarcodeLookups).toHaveBeenCalledTimes(1);
    expect(mockClearAll).toHaveBeenCalledTimes(1);
  });

  it('rejects logout wipe failures after attempting remaining cleanup tasks', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockClearManagedImageDirectory.mockRejectedValueOnce(new Error('managed image cleanup failed'));

    await expect(clearLocalLogoutFootprint()).rejects.toThrow('clearManagedImageDirectory');

    expect(mockClearSession).toHaveBeenCalledTimes(1);
    expect(mockClearAll).toHaveBeenCalledTimes(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[LocalFootprint] Local privacy footprint wipe failed',
      expect.objectContaining({
        reason: 'logout',
        failedTasks: ['clearManagedImageDirectory'],
      }),
    );

    consoleErrorSpy.mockRestore();
  });
});
