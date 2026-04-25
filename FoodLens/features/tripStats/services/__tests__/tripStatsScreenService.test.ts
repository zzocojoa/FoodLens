import { startTripFromCurrentLocation } from '../tripStatsScreenService';

const mockResolveCurrentLocation = jest.fn();
const mockStartTrip = jest.fn();
const mockConsoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);

jest.mock('../tripStatsService', () => ({
  TRIP_STATS_LOCATION_UNAVAILABLE_ERROR: 'TRIP_STATS_LOCATION_UNAVAILABLE',
  tripStatsService: {
    resolveCurrentLocation: (...args: unknown[]) => mockResolveCurrentLocation(...args),
    startTrip: (...args: unknown[]) => mockStartTrip(...args),
  },
}));

describe('startTripFromCurrentLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockConsoleError.mockClear();
  });

  it('returns location unavailable when recent location lookup cannot resolve a location', async () => {
    mockResolveCurrentLocation.mockRejectedValueOnce(new Error('TRIP_STATS_LOCATION_UNAVAILABLE'));

    await expect(startTripFromCurrentLocation('usr_tripstats')).resolves.toEqual({
      ok: false,
      reason: 'location_unavailable',
    });

    expect(mockStartTrip).not.toHaveBeenCalled();
  });

  it('returns profile save failed when the trip profile update rejects', async () => {
    mockResolveCurrentLocation.mockResolvedValueOnce({
      ok: true,
      locationName: 'Daegu, South Korea',
      coordinates: { latitude: 35.8714, longitude: 128.6014 },
    });
    mockStartTrip.mockRejectedValueOnce(new Error('PHASE2_SYNC_NOT_CONFIRMED'));

    await expect(startTripFromCurrentLocation('usr_tripstats')).resolves.toEqual({
      ok: false,
      reason: 'profile_save_failed',
    });

    expect(mockStartTrip).toHaveBeenCalledWith(
      'usr_tripstats',
      'Daegu, South Korea',
      { latitude: 35.8714, longitude: 128.6014 },
      expect.any(Date)
    );
    expect(mockConsoleError).toHaveBeenCalledWith(expect.any(Error));
  });
});
