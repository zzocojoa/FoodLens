import { Colors } from '@/constants/theme';
import { UserProfile } from '@/models/User';
import { AnalysisRecord } from '@/services/analysis/types';
import { SafetyStatus } from '@/services/aiCore/types';

export type TripStatsTheme = typeof Colors.light;

export type TripStatsTone = 'neutral' | 'safe' | 'caution' | 'danger';
export type TripStatsHeroScope = 'currentTrip' | 'allTime';

export type TripStatsJourneyEntry = {
    id: string;
    record: AnalysisRecord;
    foodName: string;
    safetyStatus: SafetyStatus;
    tone: TripStatsTone;
    timestamp: Date;
    locationLabel: string;
    countryCode: string;
    countryLabel: string;
    cityLabel: string | null;
    imageUri: string | null;
    isCurrentTrip: boolean;
};

export type TripStatsCountryChapter = {
    id: string;
    countryCode: string;
    countryLabel: string;
    latestLocationLabel: string;
    analysisCount: number;
    safeCount: number;
    cautionCount: number;
    dangerCount: number;
    cityCount: number;
    currentTripCount: number;
    tone: TripStatsTone;
    firstVisitedAt: Date;
    lastVisitedAt: Date;
    recentEntries: TripStatsJourneyEntry[];
};

export type TripStatsPassportTotals = {
    totalAnalyses: number;
    safeCount: number;
    cautionCount: number;
    dangerCount: number;
    currentTripCount: number;
    currentTripSafeCount: number;
    currentTripCautionCount: number;
    currentTripDangerCount: number;
    countriesVisitedCount: number;
    citiesVisitedCount: number;
};

export type TripStatsHeroSummary = {
    scope: TripStatsHeroScope;
    tripStartDate: Date | null;
    locationLabel: string | null;
    tone: TripStatsTone;
    analysisCount: number;
    safeCount: number;
    cautionCount: number;
    dangerCount: number;
    totalCount: number;
    chapterCount: number;
    recentJourneyCount: number;
};

export type TripStatsScreenViewModel = {
    hasActiveTrip: boolean;
    hero: TripStatsHeroSummary;
    passportTotals: TripStatsPassportTotals;
    countryChapters: TripStatsCountryChapter[];
    recentJourneyEntries: TripStatsJourneyEntry[];
};

export type TripStatsSnapshot = {
    user: UserProfile | null;
    analyses: AnalysisRecord[];
    tripStartDate: Date | null;
    currentLocation: string | null;
    viewModel: TripStatsScreenViewModel;
};

export type TripStatsStartTripResult =
    | {
          ok: true;
          tripStartDate: Date;
          currentLocation: string;
      }
    | {
          ok: false;
          reason: 'auth_required' | 'permission_denied' | 'location_unavailable' | 'profile_save_failed';
      };

export type TripStatsState = {
    loading: boolean;
    currentLocation: string | null;
    isLocating: boolean;
    tripStartDate: Date | null;
    viewModel: TripStatsScreenViewModel | null;
    startFeedbackLocation: string | null;
};
