import * as Location from 'expo-location';
import { AnalysisService } from '@/services/analysisService';
import { UserService } from '@/services/userService';
import { buildLocationLabel } from '../utils/tripStatsCalculations';
import { ensureForegroundLocationPermission } from '@/services/permissions/locationPermissionService';

type Coordinates = { latitude: number; longitude: number };

export const tripStatsService = {
  async loadUserTripData(userId: string) {
    const [user, allAnalyses] = await Promise.all([
      UserService.getUserProfile(userId),
      AnalysisService.getAllAnalyses(userId),
    ]);

    return { user, allAnalyses };
  },

  async resolveCurrentLocation() {
    const permission = await ensureForegroundLocationPermission();
    if (!permission.granted) {
      return { ok: false as const, reason: 'permission_denied' as const };
    }

    const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    const { latitude, longitude } = location.coords;

    let locationName = `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
    try {
      const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      locationName = buildLocationLabel(reverseGeocode.length > 0 ? reverseGeocode[0] : null, locationName);
    } catch (geocodeError) {
      console.warn('Geocoding failed', geocodeError);
    }

    return {
      ok: true as const,
      locationName,
      coordinates: { latitude, longitude } satisfies Coordinates,
    };
  },

  async startTrip(userId: string, locationName: string, coordinates: Coordinates, now: Date) {
    await UserService.CreateOrUpdateProfile(userId, '', {
      currentTripStart: now.toISOString(),
      currentTripLocation: locationName,
      currentTripCoordinates: coordinates,
    });
  },
};
