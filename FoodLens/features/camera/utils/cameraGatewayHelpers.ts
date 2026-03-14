import * as Location from 'expo-location';

import {
    normalizeLanguageSettings,
    resolveEffectiveLocale,
} from '@/features/i18n/services/languageService';
import { assertAnalysisImageFileReady } from '../../../services/analysis/flow';
import { getLocationData, validateCoordinates } from '../../../services/utils';
import { UserService } from '../../../services/userService';
import { DEFAULT_ISO_CODE, getCameraUserId } from '../constants/camera.constants';
import { LocationContext } from '../types/camera.types';
import { createFallbackLocation } from './cameraMappers';
import {
    resolveTravelerCardCountryCode,
    resolveTravelerLocaleFallbackCountryCode,
} from '@/services/travelerCardLanguage';

export const resolveIsoCodeFromContext = async (
    locationData: LocationContext | null | undefined
): Promise<string> => {
    const photoCountryCode = locationData?.isoCountryCode?.trim().toUpperCase();
    let targetLanguage: string | undefined;
    let fallbackCountryCode = DEFAULT_ISO_CODE;
    if (!photoCountryCode) {
        try {
            const user = await UserService.getUserProfile(getCameraUserId());
            if (user && user.settings.targetLanguage) {
                targetLanguage = user.settings.targetLanguage;
            }
            if (user?.settings) {
                const effectiveLocale = resolveEffectiveLocale(
                    normalizeLanguageSettings({
                        language: user.settings.language,
                        targetLanguage: user.settings.targetLanguage || null,
                    })
                );
                fallbackCountryCode = resolveTravelerLocaleFallbackCountryCode(effectiveLocale);
            }
        } catch (error) {
            console.warn('Failed to load user preference for language fallback', error);
        }

        try {
            const currentLocation = await getLocationData();
            const currentCountryCode = currentLocation?.isoCountryCode?.trim().toUpperCase();
            if (currentCountryCode) {
                return resolveTravelerCardCountryCode({
                    photoCountryCode: currentCountryCode,
                    targetLanguage,
                    fallbackCountryCode,
                });
            }
        } catch (error) {
            console.warn('Failed to resolve current location for language fallback', error);
        }
    }

    return resolveTravelerCardCountryCode({
        photoCountryCode,
        targetLanguage,
        fallbackCountryCode,
    });
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

    return (await getLocationData()) || null;
};

export const assertImageFileReady = assertAnalysisImageFileReady;
