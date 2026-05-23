import { fetchHomeDashboardData } from '../homeDashboardService';
import { AnalysisRecord } from '@/services/analysis/types';
import { queryClient } from '@/services/queryClient';

const mockLoadUserProfileWithHistory = jest.fn();
const mockBuildWeeklyStats = jest.fn();

jest.mock('@/services/user/profileAnalysisLoader', () => ({
  loadUserProfileWithHistory: (...args: unknown[]) => mockLoadUserProfileWithHistory(...args),
}));

jest.mock('../../utils/homeDashboard', () => ({
  buildWeeklyStats: (...args: unknown[]) => mockBuildWeeklyStats(...args),
}));

describe('fetchHomeDashboardData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    queryClient.clear();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('derives recent scans from the single history snapshot load', async () => {
    const allHistory: AnalysisRecord[] = [
      {
        id: 'record_1',
        foodName: 'Record 1',
        ingredients: [],
        safetyStatus: 'SAFE',
        timestamp: new Date('2026-04-24T12:00:00.000Z'),
      },
      {
        id: 'record_2',
        foodName: 'Record 2',
        ingredients: [],
        safetyStatus: 'CAUTION',
        timestamp: new Date('2026-04-23T12:00:00.000Z'),
      },
      {
        id: 'record_3',
        foodName: 'Record 3',
        ingredients: [],
        safetyStatus: 'SAFE',
        timestamp: new Date('2026-04-22T12:00:00.000Z'),
      },
      {
        id: 'record_4',
        foodName: 'Record 4',
        ingredients: [],
        safetyStatus: 'DANGER',
        timestamp: new Date('2026-04-21T12:00:00.000Z'),
      },
    ];
    const weeklyStats = [{ label: 'Mon', count: 2 }];
    const profile = { uid: 'usr_home' };

    mockLoadUserProfileWithHistory.mockResolvedValue({
      allHistory,
      profile,
    });
    mockBuildWeeklyStats.mockReturnValue(weeklyStats);

    const result = await fetchHomeDashboardData('usr_home');

    expect(mockLoadUserProfileWithHistory).toHaveBeenCalledTimes(1);
    expect(mockLoadUserProfileWithHistory).toHaveBeenCalledWith('usr_home', {
      allowBackgroundRefresh: false,
    });
    expect(mockBuildWeeklyStats).toHaveBeenCalledWith(allHistory);
    expect(result).toEqual({
      recentData: allHistory.slice(0, 3),
      allHistory,
      profile,
      weeklyStats,
      safeCount: 2,
    });
    expect(queryClient.getQueryData(['history', 'usr_home'])).toEqual(allHistory);
  });
});
