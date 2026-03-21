import { act, renderHook, waitFor } from '@testing-library/react-native';
import { dispatchPhase2SyncQueue, enqueuePhase2Sync } from '@/services/sync/phase2SyncQueue';
import { updateUserClientState } from '@/services/user/clientStateService';
import { useHistoryData } from '../useHistoryData';

const mockUseHistoryQuery = jest.fn();
const mockUseDeleteAnalysisMutation = jest.fn();
const mockAggregateHistoryByCountry = jest.fn();
const mockBuildInitialRegion = jest.fn();

jest.mock('../queries/useHistoryQuery', () => ({
  useHistoryQuery: (...args: unknown[]) => mockUseHistoryQuery(...args),
}));

jest.mock('../mutations/useAnalysisMutations', () => ({
  useDeleteAnalysisMutation: (...args: unknown[]) => mockUseDeleteAnalysisMutation(...args),
}));

jest.mock('../historyDataUtils', () => ({
  aggregateHistoryByCountry: (...args: unknown[]) => mockAggregateHistoryByCountry(...args),
  buildInitialRegion: (...args: unknown[]) => mockBuildInitialRegion(...args),
  removeItemsFromArchive: jest.fn(),
}));

jest.mock('@/features/i18n', () => ({
  useI18n: () => ({
    locale: 'en-US',
    t: (_key: string, fallback?: string) => fallback || _key,
  }),
}));

jest.mock('@/services/sync/phase2SyncQueue', () => ({
  enqueuePhase2Sync: jest.fn(),
  dispatchPhase2SyncQueue: jest.fn(),
}));

jest.mock('@/services/user/clientStateService', () => ({
  updateUserClientState: jest.fn(),
}));

const mockedEnqueuePhase2Sync = enqueuePhase2Sync as jest.MockedFunction<typeof enqueuePhase2Sync>;
const mockedDispatchPhase2SyncQueue =
  dispatchPhase2SyncQueue as jest.MockedFunction<typeof dispatchPhase2SyncQueue>;
const mockedUpdateUserClientState =
  updateUserClientState as jest.MockedFunction<typeof updateUserClientState>;

describe('useHistoryData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseHistoryQuery.mockReturnValue({
      data: [{ id: 'record_1' }],
      isLoading: false,
      refetch: jest.fn(),
      isRefetching: false,
    });
    mockUseDeleteAnalysisMutation.mockReturnValue({
      mutateAsync: jest.fn(),
    });
    mockAggregateHistoryByCountry.mockReturnValue([
      {
        country: 'Korea',
        flag: '🇰🇷',
        total: 1,
        coordinates: [37.5665, 126.978],
        regions: [],
      },
    ]);
    mockBuildInitialRegion.mockReturnValue({
      latitude: 37.5665,
      longitude: 126.978,
      latitudeDelta: 0.3,
      longitudeDelta: 0.3,
    });
  });

  it('keeps expanded countries in local hook state only', async () => {
    const { result } = renderHook(() => useHistoryData('usr_history'));

    await waitFor(() => {
      expect(Array.from(result.current.expandedCountries)).toEqual(['Korea-0']);
    });

    act(() => {
      result.current.setExpandedCountries(new Set(['Japan-0']));
    });

    expect(Array.from(result.current.expandedCountries)).toEqual(['Japan-0']);
    expect(mockedEnqueuePhase2Sync).not.toHaveBeenCalled();
    expect(mockedDispatchPhase2SyncQueue).not.toHaveBeenCalled();
    expect(mockedUpdateUserClientState).not.toHaveBeenCalled();
  });
});
