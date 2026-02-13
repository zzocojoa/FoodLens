import * as FileSystem from 'expo-file-system/legacy';
import * as Location from 'expo-location';

import { getLocationData, validateCoordinates } from '../../../services/utils';
import { UserService } from '../../../services/userService';
import { DEFAULT_ISO_CODE, TEST_UID } from '../constants/camera.constants';
import { LocationContext } from '../types/camera.types';
import { createFallbackLocation } from './cameraMappers';

export const assertImageFileReady = async (uri: string): Promise<void> => {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists || (fileInfo as any).size === 0) {
        throw new Error('File validation failed: Image is empty or missing.');
    }
};

export const resolveIsoCodeFromContext = async (
    locationData: LocationContext | null | undefined
): Promise<string> => {
    let isoCode = locationData?.isoCountryCode;
    if (!isoCode) {
        try {
            const user = await UserService.getUserProfile(TEST_UID);
            if (user && user.settings.targetLanguage) {
                isoCode = user.settings.targetLanguage;
            }
        } catch (error) {
            console.warn('Failed to load user preference for language fallback', error);
        }
    }
    return isoCode || DEFAULT_ISO_CODE;
};

export const resolveInitialLocationContext = async ({
    photoLat,
    photoLng,
    sourceType,
}: {
    photoLat?: string;
    photoLng?: string;
    sourceType?: 'camera' | 'library';
}): Promise<LocationContext | null> => {
    if (photoLat && photoLng) {
        const validCoords = validateCoordinates(photoLat, photoLng);
        if (!validCoords) {
            console.warn('Invalid EXIF coordinates provided:', photoLat, photoLng);
            return null;
        }

        const { latitude: lat, longitude: lng } = validCoords;
        const fallbackLocation = createFallbackLocation(lat, lng);

        try {
            const reverseGeocode = await Location.reverseGeocodeAsync({
                latitude: lat,
                longitude: lng,
            });

            if (reverseGeocode.length === 0) {
                return fallbackLocation;
            }

            const place = reverseGeocode[0];
            const country = place.country || 'Unknown';
            const city = place.city || place.region || 'Unknown';
            const district = place.district || place.subregion || '';
            const subregion = place.name || place.street || '';

            const addressParts = [subregion, district, city, country];
            const uniqueParts = Array.from(
                new Set(addressParts.filter((part) => part && part !== 'Unknown'))
            );

            return {
                ...fallbackLocation,
                country,
                city,
                district,
                subregion,
                isoCountryCode: place.isoCountryCode || undefined,
                formattedAddress: uniqueParts.join(', '),
            };
        } catch (error) {
            console.warn('Reverse geocode for photo failed', error);
            return fallbackLocation;
        }
    }

    if (sourceType === 'camera') {
        return (await getLocationData()) || null;
    }

    return null;
};

