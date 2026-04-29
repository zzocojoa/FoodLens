import { TripStatsSnapshot, TripStatsStartTripResult } from '../types/tripStats.types';
import { buildTripStatsScreenViewModel } from '../utils/tripStatsCalculations';
import { TripStatsLocationUnavailableError, tripStatsService } from './tripStatsService';

type SerializedTripStartError = {
    name: string;
    message: string;
};

const isUsableTripStatsUserId = (userId: string): boolean => {
    const normalizedUserId = userId.trim();
    return normalizedUserId.length > 0 && normalizedUserId !== 'auth-required';
};

const serializeTripStartError = (error: unknown): SerializedTripStartError => {
    if (error instanceof Error) {
        return {
            name: error.name,
            message: error.message,
        };
    }

    return {
        name: 'UnknownError',
        message: String(error),
    };
};

export const loadTripStatsSnapshot = async (userId: string): Promise<TripStatsSnapshot> => {
    const { user, allAnalyses } = await tripStatsService.loadUserTripData(userId);
    const rawTripStartDate = user?.currentTripStart ? new Date(user.currentTripStart) : null;
    const tripStartDate = rawTripStartDate && !Number.isNaN(rawTripStartDate.getTime()) ? rawTripStartDate : null;
    const currentLocation = tripStartDate ? user?.currentTripLocation || null : null;

    return {
        user,
        analyses: allAnalyses,
        tripStartDate,
        currentLocation,
        viewModel: buildTripStatsScreenViewModel(user, allAnalyses),
    };
};

export const startTripFromCurrentLocation = async (
    userId: string,
): Promise<TripStatsStartTripResult> => {
    if (!isUsableTripStatsUserId(userId)) {
        return { ok: false as const, reason: 'auth_required' as const };
    }

    let locationResult: Awaited<ReturnType<typeof tripStatsService.resolveCurrentLocation>>;
    try {
        locationResult = await tripStatsService.resolveCurrentLocation();
        if (!locationResult.ok) {
            return { ok: false as const, reason: 'permission_denied' as const };
        }
    } catch (error) {
        if (error instanceof TripStatsLocationUnavailableError) {
            return { ok: false as const, reason: 'location_unavailable' as const };
        }

        throw error;
    }

    const now = new Date();
    try {
        await tripStatsService.startTrip(
            userId,
            locationResult.locationName,
            locationResult.coordinates,
            now,
        );
    } catch (error) {
        console.error('[TripStats] trip profile save failed', {
            userId,
            locationName: locationResult.locationName,
            error: serializeTripStartError(error),
        });
        return { ok: false as const, reason: 'profile_save_failed' as const };
    }

    return {
        ok: true as const,
        tripStartDate: now,
        currentLocation: locationResult.locationName,
    };
};
