import { LocationContext } from '../types/camera.types';

export const createFallbackLocation = (
    lat: number,
    lng: number,
    isoCode?: string,
    address: string = ''
): LocationContext => ({
    latitude: lat,
    longitude: lng,
    country: null,
    city: null,
    district: '',
    subregion: '',
    isoCountryCode: isoCode,
    formattedAddress: address,
});

export const isRetryableServerError = (errorMessage: string): boolean =>
    errorMessage.includes('status 5') || errorMessage.includes('status 500');

export const isFileError = (errorMessage: string): boolean =>
    errorMessage.includes('file') ||
    errorMessage.includes('read') ||
    errorMessage.includes('access') ||
    errorMessage.includes('permission') ||
    errorMessage.includes('corrupt') ||
    errorMessage.includes('validation');

