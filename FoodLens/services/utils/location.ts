import * as Location from 'expo-location';
import { validateCoordinates } from './coordinates';
import { LocationData } from './types';
import { mapPlaceToLocationData } from './locationMapper';

/**
 * Timeout helper for promises.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    promise,
    new Promise<T | null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * Fetches current location and geocoded country/city data with detailed address.
 */
export const getLocationData = async (): Promise<LocationData | null> => {
  try {
    const { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
      if (newStatus !== 'granted') return null;
    }

    const locationResult = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      3000,
    );

    if (!locationResult) return null;

    const { latitude, longitude } = locationResult.coords;

    let mappedLocation: LocationData = {
      latitude,
      longitude,
      country: null,
      city: null,
      district: '',
      subregion: '',
      isoCountryCode: undefined,
      formattedAddress: '',
    };

    try {
      const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (reverseGeocode.length > 0) {
        mappedLocation = mapPlaceToLocationData(reverseGeocode[0], latitude, longitude);
      }
    } catch (error) {
      console.warn('Reverse geocode failed', error);
    }

    return mappedLocation;
  } catch (error) {
    console.error('getLocationData failed', error);
    return null;
  }
};

/**
 * Extracts and normalizes GPS data from EXIF.
 */
export const extractLocationFromExif = async (exif: any): Promise<LocationData | null> => {
  if (!exif) return null;

  let lat = exif.GPSLatitude;
  let long = exif.GPSLongitude;

  if (typeof lat !== 'number' || typeof long !== 'number') return null;

  const latRef = exif.GPSLatitudeRef;
  const longRef = exif.GPSLongitudeRef;
  if (latRef === 'S') lat = -lat;
  if (longRef === 'W') long = -long;

  const valid = validateCoordinates(lat, long);
  if (!valid) return null;

  try {
    const reverseGeocode = await Location.reverseGeocodeAsync({
      latitude: valid.latitude,
      longitude: valid.longitude,
    });

    if (reverseGeocode.length > 0) {
      return mapPlaceToLocationData(reverseGeocode[0], valid.latitude, valid.longitude, 'US');
    }
  } catch (error) {
    console.warn('EXIF Reverse Geocode failed:', error);
  }

  return {
    latitude: valid.latitude,
    longitude: valid.longitude,
    country: null,
    city: null,
    district: '',
    subregion: '',
    isoCountryCode: 'US',
    formattedAddress: `${valid.latitude.toFixed(4)}, ${valid.longitude.toFixed(4)}`,
  };
};
