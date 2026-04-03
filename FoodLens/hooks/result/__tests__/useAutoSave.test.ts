import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useAutoSave } from '../useAutoSave';
import { autoSaveService } from '../autoSaveService';

const mockUseLocalSearchParams = jest.fn();

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockUseLocalSearchParams(),
}));

jest.mock('../autoSaveService', () => ({
  autoSaveService: {
    save: jest.fn(),
  },
}));

jest.mock('@/services/auth/currentUser', () => ({
  getCurrentUserIdSnapshot: () => 'usr_test',
}));

const mockedAutoSaveService = autoSaveService as jest.Mocked<typeof autoSaveService>;

describe('useAutoSave', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({
      fromStore: 'true',
      isNew: 'true',
    });
    jest.spyOn(console, 'error').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('retries save after a failed autosave attempt', async () => {
    const onSave = jest.fn();
    const stableResult = {
      foodName: 'Bibimbap',
      safetyStatus: 'CAUTION' as const,
      ingredients: [],
      request_id: 'req-123',
    };
    mockedAutoSaveService.save
      .mockRejectedValueOnce(new Error('save failed'))
      .mockResolvedValueOnce({
        id: 'record-42',
        foodName: 'Bibimbap',
        safetyStatus: 'CAUTION',
        ingredients: [],
        timestamp: new Date('2026-04-03T00:00:00.000Z'),
      });

    const { result } = renderHook(() =>
      useAutoSave(
        stableResult,
        null,
        undefined,
        '2026-04-03T00:00:00.000Z',
        onSave,
      ),
    );

    await waitFor(() => {
      expect(result.current.saveStatus).toBe('failed');
    });

    await act(async () => {
      result.current.retrySave();
    });

    await waitFor(() => {
      expect(result.current.saveStatus).toBe('saved');
    });

    expect(mockedAutoSaveService.save).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'record-42',
      }),
    );
  });
});
