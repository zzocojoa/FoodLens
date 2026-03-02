import * as Location from 'expo-location';
import type { LocationGeocodedAddress } from 'expo-location';
import { validateCoordinates } from './coordinates_Logic';
import { LocationData } from './types';
import { mapPlaceToLocationData } from './locationMapper_Logic';
import { ensureForegroundLocationPermission } from '@/services/permissions/locationPermissionService_Logic';

const LOCATION_TIMEOUT_MS = Number(process.env['EXPO_PUBLIC_LOCATION_TIMEOUT_MS'] || '7000');
const REVERSE_GEOCODE_TIMEOUT_MS = 2500;
const LAST_KNOWN_MAX_AGE_MS = 15 * 60 * 1000;
const EXIF_DEFAULT_ISO = 'US';
const EMPTY_LOCATION_TEXT = '';
let lastResolvedLocation: LocationData | null = null;

type ExifLocationInput = {
  GPSLatitude?: unknown;
  GPSLongitude?: unknown;
  GPSLatitudeRef?: unknown;
  GPSLongitudeRef?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const toNumber = (value: unknown): number | null =>
  typeof value === 'number' ? value : null;

const toRef = (value: unknown): string | null =>
  typeof value === 'string' ? value : null;

const hasGeocodeResult = (
  value: LocationGeocodedAddress[]
): value is [LocationGeocodedAddress, ...LocationGeocodedAddress[]] => value.length > 0;

const buildFallbackLocation = (latitude: number, longitude: number): LocationData => ({
  latitude,
  longitude,
  country: null,
  city: null,
  district: EMPTY_LOCATION_TEXT,
  subregion: EMPTY_LOCATION_TEXT,
  isoCountryCode: EXIF_DEFAULT_ISO,
  formattedAddress: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
});

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
    const permission = await ensureForegroundLocationPermission();
    if (!permission.granted) return null;

    const lastKnownPosition = await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: 5000,
    }).catch(() => null);

    const locationResult = await withTimeout(
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      LOCATION_TIMEOUT_MS,
    );

    const activePosition = locationResult ?? lastKnownPosition;

    if (!activePosition) {
      return lastResolvedLocation;
    }

    const { latitude, longitude } = activePosition.coords;

    let mappedLocation: LocationData = buildFallbackLocation(latitude, longitude);

    try {
      const reverseGeocode = await withTimeout(
        Location.reverseGeocodeAsync({ latitude, longitude }),
        REVERSE_GEOCODE_TIMEOUT_MS,
      );
      if (Array.isArray(reverseGeocode) && hasGeocodeResult(reverseGeocode)) {
        mappedLocation = mapPlaceToLocationData(reverseGeocode[0], latitude, longitude);
      }
    } catch (error) {
      console.warn('Reverse geocode failed', error);
    }

    lastResolvedLocation = mappedLocation;
    return mappedLocation;
  } catch (error) {
    console.error('getLocationData failed', error);
    return lastResolvedLocation;
  }
};

/**
 * Extracts and normalizes GPS data from EXIF.
 */
export const extractLocationFromExif = async (exif: unknown): Promise<LocationData | null> => {
  if (!isRecord(exif)) return null;

  const data = exif as ExifLocationInput;
  const latRaw = toNumber(data.GPSLatitude);
  const longRaw = toNumber(data.GPSLongitude);

  if (latRaw === null || longRaw === null) return null;

  let lat = latRaw;
  let long = longRaw;

  const latRef = toRef(data.GPSLatitudeRef);
  const longRef = toRef(data.GPSLongitudeRef);
  if (latRef === 'S') lat = -lat;
  if (longRef === 'W') long = -long;

  const valid = validateCoordinates(lat, long);
  if (!valid) return null;

  try {
    const reverseGeocode = await Location.reverseGeocodeAsync({
      latitude: valid.latitude,
      longitude: valid.longitude,
    });

    if (hasGeocodeResult(reverseGeocode)) {
      return mapPlaceToLocationData(
        reverseGeocode[0],
        valid.latitude,
        valid.longitude,
        EXIF_DEFAULT_ISO
      );
    }
  } catch (error) {
    console.warn('EXIF Reverse Geocode failed:', error);
  }

  return buildFallbackLocation(valid.latitude, valid.longitude);
};
