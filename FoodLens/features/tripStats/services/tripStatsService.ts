import { loadUserProfileWithHistory } from '@/services/user/profileAnalysisLoader';
import { UserService } from '@/services/userService';
import { getRecentLocationData, type LocationData } from '@/services/utils';
import { buildLocationLabel } from '../utils/tripStatsCalculations';
import { ensureForegroundLocationPermission } from '@/services/permissions/locationPermissionService';

type Coordinates = { latitude: number; longitude: number };

export class TripStatsLocationUnavailableError extends Error {
  constructor() {
    super('TRIP_STATS_LOCATION_UNAVAILABLE');
    this.name = 'TripStatsLocationUnavailableError';
  }
}

type ResolvedTripLocation = {
  locationName: string;
  coordinates: Coordinates;
};

const formatCoordinateLabel = (latitude: number, longitude: number): string => {
  return `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
};

const resolveTripLocationName = (location: LocationData): string => {
  return buildLocationLabel(
    {
      city: location.city || location.district || location.subregion || null,
      region: null,
      country: location.country || null,
    },
    formatCoordinateLabel(location.latitude, location.longitude)
  );
};

const resolveTripLocation = async (): Promise<ResolvedTripLocation> => {
  const locationData = await getRecentLocationData();
  if (locationData === null) {
    throw new TripStatsLocationUnavailableError();
  }

  return {
    locationName: resolveTripLocationName(locationData),
    coordinates: {
      latitude: locationData.latitude,
      longitude: locationData.longitude,
    },
  };
};

export const tripStatsService = {
  async loadUserTripData(userId: string) {
    const { profile: user, allHistory: allAnalyses } = await loadUserProfileWithHistory(userId);
    return { user, allAnalyses };
  },

  async resolveCurrentLocation(): Promise<
    | { ok: true; locationName: string; coordinates: Coordinates }
    | { ok: false; reason: 'permission_denied' }
  > {
    const permission = await ensureForegroundLocationPermission();
    if (!permission.granted) {
      return { ok: false as const, reason: 'permission_denied' as const };
    }

    const resolvedLocation = await resolveTripLocation();
    return {
      ok: true as const,
      locationName: resolvedLocation.locationName,
      coordinates: resolvedLocation.coordinates,
    };
  },

  async startTrip(userId: string, locationName: string, coordinates: Coordinates, now: Date) {
    await UserService.CreateOrUpdateProfileDeferredSync(userId, '', {
      currentTripStart: now.toISOString(),
      currentTripLocation: locationName,
      currentTripCoordinates: coordinates,
    });
  },
};
