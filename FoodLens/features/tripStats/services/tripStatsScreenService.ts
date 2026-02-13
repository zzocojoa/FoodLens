import { countSafeAnalysesFromStart, countSafeAnalysesTotal } from '../utils/tripStatsCalculations';
import { tripStatsService } from './tripStatsService';

export type TripStatsSnapshot = {
  totalCount: number;
  safeCount: number;
  tripStartDate: Date | null;
  currentLocation: string | null;
};

export const loadTripStatsSnapshot = async (userId: string): Promise<TripStatsSnapshot> => {
  const { user, allAnalyses } = await tripStatsService.loadUserTripData(userId);

  const totalCount = allAnalyses.length;

  if (user?.currentTripStart) {
    const tripStartDate = new Date(user.currentTripStart);
    const startTime = tripStartDate.getTime();
    return {
      totalCount,
      safeCount: countSafeAnalysesFromStart(allAnalyses, startTime),
      tripStartDate,
      currentLocation: user.currentTripLocation || null,
    };
  }

  return {
    totalCount,
    safeCount: countSafeAnalysesTotal(allAnalyses),
    tripStartDate: null,
    currentLocation: null,
  };
};

export const startTripFromCurrentLocation = async (userId: string) => {
  const locationResult = await tripStatsService.resolveCurrentLocation();
  if (!locationResult.ok) {
    return { ok: false as const, reason: 'permission_denied' as const };
  }

  const now = new Date();
  await tripStatsService.startTrip(
    userId,
    locationResult.locationName,
    locationResult.coordinates,
    now
  );

  return {
    ok: true as const,
    tripStartDate: now,
    currentLocation: locationResult.locationName,
  };
};
