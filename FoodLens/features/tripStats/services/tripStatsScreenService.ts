import { TripStatsSnapshot, TripStatsStartTripResult } from '../types/tripStats.types';
import { buildTripStatsScreenViewModel } from '../utils/tripStatsCalculations';
import { TRIP_STATS_LOCATION_UNAVAILABLE_ERROR, tripStatsService } from './tripStatsService';

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
    let locationResult: Awaited<ReturnType<typeof tripStatsService.resolveCurrentLocation>>;
    try {
        locationResult = await tripStatsService.resolveCurrentLocation();
        if (!locationResult.ok) {
            return { ok: false as const, reason: 'permission_denied' as const };
        }
    } catch (error) {
        if (error instanceof Error && error.message === TRIP_STATS_LOCATION_UNAVAILABLE_ERROR) {
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
        console.error(error);
        return { ok: false as const, reason: 'profile_save_failed' as const };
    }

    return {
        ok: true as const,
        tripStartDate: now,
        currentLocation: locationResult.locationName,
    };
};
