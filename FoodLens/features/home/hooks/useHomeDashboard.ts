import { useCallback, useEffect, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useFocusEffect } from '@react-navigation/native';
import { AnalysisRecord, AnalysisService } from '../../../services/analysisService';
import { UserProfile } from '../../../models/User';
import { WeeklyData } from '../../../components/weeklyStatsStrip/types';
import { HomeModalType } from '../types/home.types';
import { filterScansByDate } from '../utils/homeDashboard';
import { fetchHomeDashboardData, getProfileRestrictionCount } from '../services/homeDashboardService';
import { useI18n } from '@/features/i18n';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser';
import { subscribeUserProfileUpdated } from '@/services/user/userProfileStore';
import { SafeStorage } from '@/services/storage';
import { getUserStorageKey } from '@/services/user/constants';
import {
  buildHomeSelectedDatePatch,
  readHomeSelectedDateSnapshot,
  updateUserClientState,
} from '@/services/user/clientStateService';
import { fromLocalDateString, toLocalDateString } from '@/services/sync/clientState';

const PROFILE_REFRESH_DEBOUNCE_MS = 250;
const DASHBOARD_BACKGROUND_REFRESH_MS = 15_000;
const PROFILE_IMAGE_REUSE_BUFFER_MS = 15_000;

const extractSignedExpiryMs = (uri: string): number | null => {
  const match = uri.match(/[?&]exp=(\d{10,13})/);
  if (!match) return null;
  const raw = Number(match[1]);
  if (!Number.isFinite(raw)) return null;
  return raw > 1_000_000_000_000 ? raw : raw * 1000;
};

const shouldKeepExistingProfileImage = (
  previous: UserProfile | null,
  next: UserProfile
): boolean => {
  if (!previous?.profileImage || !next.profileImage) return false;
  if (!previous.profileImageAssetId || !next.profileImageAssetId) return false;
  if (previous.profileImageAssetId !== next.profileImageAssetId) return false;
  if (previous.profileImage === next.profileImage) return true;

  const expiryMs = extractSignedExpiryMs(previous.profileImage);
  if (expiryMs === null) {
    // Non-signed/static URLs are stable and should not churn.
    return true;
  }
  return expiryMs - Date.now() > PROFILE_IMAGE_REUSE_BUFFER_MS;
};

type UseHomeDashboardReturn = {
  activeModal: HomeModalType;
  allergyCount: number;
  filteredScans: AnalysisRecord[];
  recentScans: AnalysisRecord[];
  safeCount: number;
  selectedDate: Date;
  userProfile: UserProfile | null;
  weeklyStats: WeeklyData[];
  setActiveModal: (modal: HomeModalType) => void;
  setSelectedDate: (date: Date) => void;
  loadDashboardData: () => Promise<void>;
  handleDeleteItem: (itemId: string) => Promise<void>;
};

const readInitialProfileSnapshot = (): UserProfile | null => {
  const userId = getCurrentUserIdSnapshot();
  return SafeStorage.getSync<UserProfile | null>(getUserStorageKey(userId), null);
};

export const useHomeDashboard = (): UseHomeDashboardReturn => {
  const { t } = useI18n();
  const initialProfileSnapshotRef = useRef<UserProfile | null>(readInitialProfileSnapshot());
  const initialUserId = getCurrentUserIdSnapshot();
  const initialSelectedDate =
    readHomeSelectedDateSnapshot(initialUserId) || new Date();
  const [recentScans, setRecentScans] = useState<AnalysisRecord[]>([]);
  const [allHistoryCache, setAllHistoryCache] = useState<AnalysisRecord[]>([]);
  const [filteredScans, setFilteredScans] = useState<AnalysisRecord[]>([]);
  const [selectedDate, setSelectedDateState] = useState<Date>(initialSelectedDate);
  const [weeklyStats, setWeeklyStats] = useState<WeeklyData[]>([]);
  const [allergyCount, setAllergyCount] = useState(() =>
    initialProfileSnapshotRef.current
      ? getProfileRestrictionCount(initialProfileSnapshotRef.current)
      : 0
  );
  const [safeCount, setSafeCount] = useState(0);
  const [activeModal, setActiveModal] = useState<HomeModalType>('NONE');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(
    () => initialProfileSnapshotRef.current
  );
  const profileRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedDateKeyRef = useRef<string>(toLocalDateString(initialSelectedDate));
  const loadInFlightRef = useRef(false);
  const profileHydrationInFlightRef = useRef(false);
  const hasRequestedInitialLoadRef = useRef(false);

  useEffect(() => {
    setFilteredScans(filterScansByDate(allHistoryCache, selectedDate));
  }, [allHistoryCache, selectedDate]);

  const loadDashboardData = useCallback(async () => {
    if (loadInFlightRef.current) {
      return;
    }
    loadInFlightRef.current = true;
    try {
      const snapshot = await fetchHomeDashboardData(getCurrentUserIdSnapshot());
      const { recentData: fetchedRecent, allHistory, profile, weeklyStats, safeCount } = snapshot;

      console.log(`[Dashboard] Loaded: ${allHistory.length} total items from storage`);

      setRecentScans(fetchedRecent);
      setAllHistoryCache(allHistory);
      setWeeklyStats(weeklyStats);
      setSafeCount(safeCount);

      if (profile) {
        const syncedSelectedDate = fromLocalDateString(profile.settings.clientState?.home?.selectedDate);
        if (syncedSelectedDate) {
          const syncedKey = toLocalDateString(syncedSelectedDate);
          if (selectedDateKeyRef.current !== syncedKey) {
            selectedDateKeyRef.current = syncedKey;
            setSelectedDateState(syncedSelectedDate);
          }
        }
        setUserProfile((previous) => {
          if (!shouldKeepExistingProfileImage(previous, profile)) {
            return profile;
          }
          return {
            ...profile,
            profileImage: previous?.profileImage || profile.profileImage,
            photoURL: previous?.profileImage || profile.profileImage,
          };
        });
        setAllergyCount(getProfileRestrictionCount(profile));
      }
    } catch (error) {
      console.error(error);
    } finally {
      loadInFlightRef.current = false;
    }
  }, []);

  const hydrateProfileFromCache = useCallback(async () => {
    if (profileHydrationInFlightRef.current) {
      return;
    }
    profileHydrationInFlightRef.current = true;
    try {
      const userId = getCurrentUserIdSnapshot();
      const profile = await SafeStorage.get<UserProfile | null>(getUserStorageKey(userId), null);
      if (!profile) return;
      setUserProfile((previous) => {
        if (!shouldKeepExistingProfileImage(previous, profile)) {
          return profile;
        }
        return {
          ...profile,
          profileImage: previous?.profileImage || profile.profileImage,
          photoURL: previous?.profileImage || profile.profileImage,
        };
      });
      setAllergyCount(getProfileRestrictionCount(profile));
    } catch (error) {
      console.error(error);
    } finally {
      profileHydrationInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (hasRequestedInitialLoadRef.current) {
      return;
    }
    hasRequestedInitialLoadRef.current = true;
    void hydrateProfileFromCache();
    void loadDashboardData();
  }, [hydrateProfileFromCache, loadDashboardData]);

  useFocusEffect(
    useCallback(() => {
      let task: { cancel?: () => void } | null = null;
      if (hasRequestedInitialLoadRef.current) {
        task = InteractionManager.runAfterInteractions(() => {
          void loadDashboardData();
        });
      }
      const intervalId = setInterval(() => {
        void loadDashboardData();
      }, DASHBOARD_BACKGROUND_REFRESH_MS);
      return () => {
        task?.cancel?.();
        clearInterval(intervalId);
      };
    }, [loadDashboardData]),
  );

  useEffect(() => {
    const userId = getCurrentUserIdSnapshot();
    const unsubscribe = subscribeUserProfileUpdated(userId, () => {
      if (profileRefreshTimerRef.current) {
        clearTimeout(profileRefreshTimerRef.current);
      }
      profileRefreshTimerRef.current = setTimeout(() => {
        void loadDashboardData();
      }, PROFILE_REFRESH_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (profileRefreshTimerRef.current) {
        clearTimeout(profileRefreshTimerRef.current);
        profileRefreshTimerRef.current = null;
      }
    };
  }, [loadDashboardData]);

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      const previousScans = [...recentScans];

      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setRecentScans((prev) => prev.filter((item) => item.id !== itemId));
        await AnalysisService.deleteAnalysis(getCurrentUserIdSnapshot(), itemId);
        loadDashboardData();
      } catch (error) {
        console.error('Home delete failed:', error);
        setRecentScans(previousScans);
        showTranslatedAlert(t, {
          titleKey: 'home.alert.errorTitle',
          titleFallback: 'Error',
          messageKey: 'home.alert.deleteFailedRestore',
          messageFallback: 'Failed to delete item. Restoring data.',
        });
      }
    },
    [loadDashboardData, recentScans, t],
  );

  const setSelectedDate = useCallback((date: Date) => {
    const nextKey = toLocalDateString(date);
    if (selectedDateKeyRef.current === nextKey) {
      setSelectedDateState(date);
      return;
    }
    selectedDateKeyRef.current = nextKey;
    setSelectedDateState(date);
    const userId = getCurrentUserIdSnapshot();
    void updateUserClientState(userId, buildHomeSelectedDatePatch(date)).catch(() => undefined);
  }, []);

  return {
    activeModal,
    allergyCount,
    filteredScans,
    recentScans,
    safeCount,
    selectedDate,
    userProfile,
    weeklyStats,
    setActiveModal,
    setSelectedDate,
    loadDashboardData,
    handleDeleteItem,
  };
};
