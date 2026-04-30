import { tripStatsService } from '../tripStatsService';

const mockLoadUserProfileWithHistory = jest.fn();
const mockCreateOrUpdateProfile = jest.fn();
const mockCreateOrUpdateProfileDeferredSync = jest.fn();
const mockGetRecentLocationData = jest.fn();
const mockEnsureForegroundLocationPermission = jest.fn();

jest.mock('@/services/user/profileAnalysisLoader', () => ({
  loadUserProfileWithHistory: (...args: unknown[]) => mockLoadUserProfileWithHistory(...args),
}));

jest.mock('@/services/userService', () => ({
  UserService: {
    CreateOrUpdateProfile: (...args: unknown[]) => mockCreateOrUpdateProfile(...args),
    CreateOrUpdateProfileDeferredSync: (...args: unknown[]) =>
      mockCreateOrUpdateProfileDeferredSync(...args),
  },
}));

jest.mock('@/services/utils', () => ({
  getRecentLocationData: (...args: unknown[]) => mockGetRecentLocationData(...args),
}));

jest.mock('@/services/permissions/locationPermissionService', () => ({
  ensureForegroundLocationPermission: (...args: unknown[]) =>
    mockEnsureForegroundLocationPermission(...args),
}));

describe('tripStatsService.startTrip', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateOrUpdateProfileDeferredSync.mockResolvedValue({ uid: 'usr_tripstats' });
  });

  it('uses deferred profile sync so trip start does not wait for sync confirmation', async () => {
    const coordinates = { latitude: 35.8714, longitude: 128.6014 };
    const now = new Date('2026-04-25T02:30:00.000Z');

    await tripStatsService.startTrip('usr_tripstats', 'Daegu, South Korea', coordinates, now);

    expect(mockCreateOrUpdateProfileDeferredSync).toHaveBeenCalledWith(
      'usr_tripstats',
      '',
      {
        currentTripStart: '2026-04-25T02:30:00.000Z',
        currentTripLocation: 'Daegu, South Korea',
        currentTripCoordinates: coordinates,
      }
    );
    expect(mockCreateOrUpdateProfile).not.toHaveBeenCalled();
  });
});

describe('tripStatsService.loadUserTripData', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads profile and history without starting another profile background refresh', async () => {
    mockLoadUserProfileWithHistory.mockResolvedValueOnce({
      profile: { uid: 'usr_tripstats' },
      allHistory: [{ id: 'analysis_trip_1' }],
    });

    await expect(tripStatsService.loadUserTripData('usr_tripstats')).resolves.toEqual({
      user: { uid: 'usr_tripstats' },
      allAnalyses: [{ id: 'analysis_trip_1' }],
    });

    expect(mockLoadUserProfileWithHistory).toHaveBeenCalledWith('usr_tripstats', {
      allowBackgroundRefresh: false,
    });
  });
});
