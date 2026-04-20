import * as Location from 'expo-location';
import { getFreshLocationData, getRecentLocationData } from '../location';

const mockEnsureForegroundLocationPermission = jest.fn();

jest.mock('@/services/permissions/locationPermissionService', () => ({
  ensureForegroundLocationPermission: (...args: unknown[]) =>
    mockEnsureForegroundLocationPermission(...args),
}));

jest.mock('expo-location', () => ({
  getCurrentPositionAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  Accuracy: {
    Balanced: 3,
  },
}));

const mockedLocation = Location as jest.Mocked<typeof Location>;

describe('location utils', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockEnsureForegroundLocationPermission.mockResolvedValue({ granted: true });
    mockedLocation.reverseGeocodeAsync.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('uses a recent last-known location when the live lookup times out', async () => {
    mockedLocation.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}) as never);
    mockedLocation.getLastKnownPositionAsync.mockResolvedValue({
      coords: {
        latitude: 37.5665,
        longitude: 126.978,
      },
    } as never);

    const resultPromise = getRecentLocationData();

    await jest.advanceTimersByTimeAsync(7_000);

    await expect(resultPromise).resolves.toMatchObject({
      latitude: 37.5665,
      longitude: 126.978,
    });
    expect(mockedLocation.getLastKnownPositionAsync).toHaveBeenCalledWith({
      maxAge: 30_000,
      requiredAccuracy: 5000,
    });
  });

  it('does not fall back to last-known location for a strict fresh lookup', async () => {
    mockedLocation.getCurrentPositionAsync.mockReturnValue(new Promise(() => {}) as never);

    const resultPromise = getFreshLocationData();

    await jest.advanceTimersByTimeAsync(7_000);

    await expect(resultPromise).resolves.toBeNull();
    expect(mockedLocation.getLastKnownPositionAsync).not.toHaveBeenCalled();
  });
});
