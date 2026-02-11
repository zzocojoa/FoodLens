import { Colors } from '@/constants/theme';

export type TripStatsTheme = typeof Colors.light;

export type TripStatsState = {
    loading: boolean;
    safeCount: number;
    totalCount: number;
    currentLocation: string | null;
    isLocating: boolean;
    tripStartDate: Date | null;
    showToast: boolean;
};
