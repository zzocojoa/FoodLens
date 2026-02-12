import * as Location from 'expo-location';
import { validateCoordinates } from './coordinates';
import { LocationData } from './types';

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

    let country: string | null = null;
    let city: string | null = null;
    let district = '';
    let subregion = '';
    let isoCountryCode: string | undefined;
    let formattedAddress = '';

    try {
      const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (reverseGeocode.length > 0) {
        const place = reverseGeocode[0];
        country = place.country || null;
        city = place.city || place.region || null;
        district = place.district || place.subregion || '';
        subregion = place.name || place.street || '';
        isoCountryCode = place.isoCountryCode || undefined;

        const addressParts = [subregion, district, city, country].filter(Boolean) as string[];
        const uniqueParts: string[] = [];
        addressParts.forEach((part) => {
          if (!uniqueParts.includes(part)) uniqueParts.push(part);
        });
        formattedAddress = uniqueParts.join(', ');
      }
    } catch (error) {
      console.warn('Reverse geocode failed', error);
    }

    return {
      latitude,
      longitude,
      country,
      city,
      district,
      subregion,
      isoCountryCode,
      formattedAddress,
    };
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
      const place = reverseGeocode[0];
      return {
        latitude: valid.latitude,
        longitude: valid.longitude,
        country: place.country || null,
        city: place.city || place.region || null,
        district: place.district || place.subregion || '',
        subregion: place.name || place.street || '',
        isoCountryCode: place.isoCountryCode || 'US',
        formattedAddress: [
          place.name || place.street,
          place.district || place.subregion,
          place.city || place.region,
          place.country,
        ]
          .filter(Boolean)
          .join(', '),
      };
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

