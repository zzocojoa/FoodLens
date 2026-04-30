import { renderHook } from '@testing-library/react-native';
import { useQuery } from '@tanstack/react-query';
import { useHistoryQuery } from '../useHistoryQuery';

const mockUseQuery = useQuery as jest.MockedFunction<typeof useQuery>;
const mockGetAllAnalyses = jest.fn();

jest.mock('@tanstack/react-query', () => ({
  useQuery: jest.fn(),
}));

jest.mock('@/services/analysisService', () => ({
  AnalysisService: {
    getAllAnalyses: (...args: unknown[]) => mockGetAllAnalyses(...args),
  },
}));

jest.mock('@/features/home/services/homeNavigationTrace', () => ({
  markHomeNavigationTrace: jest.fn(),
}));

describe('useHistoryQuery', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseQuery.mockReturnValue({ data: [] } as never);
  });

  it('uses the shared history query key and does not create a polling interval', () => {
    renderHook(() => useHistoryQuery('usr_history', { isPollingEnabled: true }));

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['history', 'usr_history'],
        refetchInterval: false,
      })
    );
  });

  it('does not refetch on mount while the screen is blurred', () => {
    renderHook(() => useHistoryQuery('usr_history', { isPollingEnabled: false }));

    expect(mockUseQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        queryKey: ['history', 'usr_history'],
        refetchOnMount: false,
        refetchInterval: false,
      })
    );
  });
});
