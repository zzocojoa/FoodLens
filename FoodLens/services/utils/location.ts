import * as Location from 'expo-location';
import type { LocationGeocodedAddress } from 'expo-location';
import { validateCoordinates } from './coordinates';
import { LocationData } from './types';
import { mapPlaceToLocationData } from './locationMapper';
import { ensureForegroundLocationPermission } from '@/services/permissions/locationPermissionService';

const LOCATION_TIMEOUT_MS = Number(process.env.EXPO_PUBLIC_LOCATION_TIMEOUT_MS || '7000');
const REVERSE_GEOCODE_TIMEOUT_MS = 2500;
const LAST_KNOWN_MAX_AGE_MS = 15 * 60 * 1000;
const EMPTY_LOCATION_TEXT = '';
let lastResolvedLocation: LocationData | null = null;

type LocationDataRequest = {
  allowLastKnownPosition: boolean;
  allowLastResolvedLocation: boolean;
  lastKnownMaxAgeMs: number | null;
  locationTimeoutMs: number;
  reverseGeocodeTimeoutMs: number;
};

const DEFAULT_LOCATION_DATA_REQUEST: LocationDataRequest = {
  allowLastKnownPosition: true,
  allowLastResolvedLocation: true,
  lastKnownMaxAgeMs: LAST_KNOWN_MAX_AGE_MS,
  locationTimeoutMs: LOCATION_TIMEOUT_MS,
  reverseGeocodeTimeoutMs: REVERSE_GEOCODE_TIMEOUT_MS,
};

const STRICT_LOCATION_DATA_REQUEST: LocationDataRequest = {
  allowLastKnownPosition: false,
  allowLastResolvedLocation: false,
  lastKnownMaxAgeMs: null,
  locationTimeoutMs: LOCATION_TIMEOUT_MS,
  reverseGeocodeTimeoutMs: REVERSE_GEOCODE_TIMEOUT_MS,
};

const RECENT_LOCATION_DATA_REQUEST: LocationDataRequest = {
  allowLastKnownPosition: true,
  allowLastResolvedLocation: false,
  lastKnownMaxAgeMs: 30_000,
  locationTimeoutMs: LOCATION_TIMEOUT_MS,
  reverseGeocodeTimeoutMs: REVERSE_GEOCODE_TIMEOUT_MS,
};

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

const resolveDefaultIsoCountryCode = (): string => {
  const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
  if (locale.startsWith('ko')) return 'KR';
  if (locale.startsWith('ja')) return 'JP';
  if (locale.startsWith('zh')) return 'CN';
  if (locale.startsWith('th')) return 'TH';
  if (locale.startsWith('vi')) return 'VN';
  return 'US';
};

const buildFallbackLocation = (
  latitude: number,
  longitude: number,
  isoCountryCode: string = resolveDefaultIsoCountryCode()
): LocationData => ({
  latitude,
  longitude,
  country: null,
  city: null,
  district: EMPTY_LOCATION_TEXT,
  subregion: EMPTY_LOCATION_TEXT,
  isoCountryCode,
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

const getLastKnownPosition = async (
  request: LocationDataRequest,
): Promise<Location.LocationObject | null> => {
  if (!request.allowLastKnownPosition || request.lastKnownMaxAgeMs === null) {
    return null;
  }

  return Location.getLastKnownPositionAsync({
    maxAge: request.lastKnownMaxAgeMs,
    requiredAccuracy: 5000,
  }).catch(() => null);
};

const getActivePosition = async (
  request: LocationDataRequest,
): Promise<Location.LocationObject | null> => {
  const lastKnownPosition = await getLastKnownPosition(request);
  const locationResult = await withTimeout(
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
    request.locationTimeoutMs,
  );

  return locationResult ?? lastKnownPosition;
};

const resolveMappedLocation = async (
  latitude: number,
  longitude: number,
  request: LocationDataRequest,
): Promise<LocationData> => {
  let mappedLocation: LocationData = buildFallbackLocation(latitude, longitude);

  try {
    const reverseGeocode = await withTimeout(
      Location.reverseGeocodeAsync({ latitude, longitude }),
      request.reverseGeocodeTimeoutMs,
    );
    if (Array.isArray(reverseGeocode) && hasGeocodeResult(reverseGeocode)) {
      mappedLocation = mapPlaceToLocationData(reverseGeocode[0], latitude, longitude);
    }
  } catch (error) {
    console.warn('Reverse geocode failed', error);
  }

  return mappedLocation;
};

const getLocationDataForRequest = async (
  request: LocationDataRequest,
): Promise<LocationData | null> => {
  try {
    const permission = await ensureForegroundLocationPermission();
    if (!permission.granted) return null;

    const activePosition = await getActivePosition(request);

    if (!activePosition) {
      return request.allowLastResolvedLocation ? lastResolvedLocation : null;
    }

    const { latitude, longitude } = activePosition.coords;
    const mappedLocation = await resolveMappedLocation(latitude, longitude, request);

    lastResolvedLocation = mappedLocation;
    return mappedLocation;
  } catch (error) {
    console.error('getLocationData failed', error);
    return request.allowLastResolvedLocation ? lastResolvedLocation : null;
  }
};

/**
 * Fetches current location and geocoded country/city data with detailed address.
 */
export const getLocationData = async (): Promise<LocationData | null> => {
  return getLocationDataForRequest(DEFAULT_LOCATION_DATA_REQUEST);
};

export const getFreshLocationData = async (): Promise<LocationData | null> => {
  return getLocationDataForRequest(STRICT_LOCATION_DATA_REQUEST);
};

export const getRecentLocationData = async (): Promise<LocationData | null> => {
  return getLocationDataForRequest(RECENT_LOCATION_DATA_REQUEST);
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
        resolveDefaultIsoCountryCode()
      );
    }
  } catch (error) {
    console.warn('EXIF Reverse Geocode failed:', error);
  }

  return buildFallbackLocation(valid.latitude, valid.longitude);
};
