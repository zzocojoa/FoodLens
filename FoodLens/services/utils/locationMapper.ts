import type { LocationGeocodedAddress } from 'expo-location';
import type { LocationData } from './types';

const unique = (parts: string[]): string[] => {
  const deduped: string[] = [];
  parts.forEach((part) => {
    if (!deduped.includes(part)) deduped.push(part);
  });
  return deduped;
};

export const buildFormattedAddress = (parts: Array<string | null | undefined>): string =>
  unique(parts.filter(Boolean) as string[]).join(', ');

export const mapPlaceToLocationData = (
  place: LocationGeocodedAddress,
  latitude: number,
  longitude: number,
  fallbackIsoCode?: string,
): LocationData => {
  const country = place.country || null;
  const city = place.city || place.region || null;
  const district = place.district || place.subregion || '';
  const subregion = place.name || place.street || '';
  const isoCountryCode = place.isoCountryCode || fallbackIsoCode;

  return {
    latitude,
    longitude,
    country,
    city,
    district,
    subregion,
    isoCountryCode,
    formattedAddress: buildFormattedAddress([subregion, district, city, country]),
  };
};
