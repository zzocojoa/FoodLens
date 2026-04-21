import { TripStatsSnapshot, TripStatsStartTripResult } from '../types/tripStats.types';
import { buildTripStatsScreenViewModel } from '../utils/tripStatsCalculations';
import { tripStatsService } from './tripStatsService';

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
    const locationResult = await tripStatsService.resolveCurrentLocation();
    if (!locationResult.ok) {
        return { ok: false as const, reason: 'permission_denied' as const };
    }

    const now = new Date();
    await tripStatsService.startTrip(
        userId,
        locationResult.locationName,
        locationResult.coordinates,
        now,
    );

    return {
        ok: true as const,
        tripStartDate: now,
        currentLocation: locationResult.locationName,
    };
};
