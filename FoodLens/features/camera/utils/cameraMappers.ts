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

export const getAnalysisErrorText = (error: unknown): string => {
    if (typeof error !== 'object' || error === null) {
        return String(error ?? '').toLowerCase();
    }

    const maybeError = error as { code?: unknown; message?: unknown };
    const errorCode = typeof maybeError.code === 'string' ? maybeError.code : '';
    const errorMessage = typeof maybeError.message === 'string' ? maybeError.message : '';
    return `${errorCode} ${errorMessage}`.toLowerCase();
};

export const isTimeoutStyleAnalysisError = (errorMessage: string): boolean =>
    errorMessage.includes('timed out') ||
    errorMessage.includes('polling timed out') ||
    errorMessage.includes('polling became stale') ||
    errorMessage.includes('analysis_job_poll_timeout') ||
    errorMessage.includes('analysis_job_poll_stale');
