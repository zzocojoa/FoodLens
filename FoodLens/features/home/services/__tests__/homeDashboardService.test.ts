import { fetchHomeDashboardData } from '../homeDashboardService';

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
  });

  it('derives recent scans from the single history snapshot load', async () => {
    const allHistory = [
      { id: 'record_1', safetyStatus: 'SAFE' },
      { id: 'record_2', safetyStatus: 'CAUTION' },
      { id: 'record_3', safetyStatus: 'SAFE' },
      { id: 'record_4', safetyStatus: 'DANGER' },
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
  });
});
