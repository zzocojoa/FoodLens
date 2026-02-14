import { CURRENT_USER_ID } from '@/services/auth/currentUser';

export const TEST_UID = CURRENT_USER_ID;
export const DEFAULT_ISO_CODE = 'US';

export const getCameraErrorMessages = (t: (key: string, fallback?: string) => string) =>
    ({
        missingImage: t(
            'camera.error.missingImage',
            'Unable to load image information. Please try again.'
        ),
        locationUnavailable: t(
            'camera.error.locationUnavailable',
            'Location is unavailable. Location-based allergy filtering may not be applied.'
        ),
        offline: t('camera.error.offline', 'Please check your internet connection.'),
        file: t('camera.error.file', 'Unable to load the image file. Please choose another photo.'),
        analysis: t(
            'camera.error.analysis',
            'There is a problem connecting to the server. Check your network and try again.'
        ),
    }) as const;
