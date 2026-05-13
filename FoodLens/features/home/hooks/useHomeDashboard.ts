import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useIsFocused } from '@react-navigation/native';
import { AnalysisRecord, AnalysisService } from '../../../services/analysisService';
import { UserProfile } from '../../../models/User';
import { WeeklyData } from '../../../components/weeklyStatsStrip/types';
import { HomeModalType } from '../types/home.types';
import { buildWeeklyStats, filterScansByDate } from '../utils/homeDashboard';
import { fetchHomeDashboardData, getProfileRestrictionCount } from '../services/homeDashboardService';
import { useI18n } from '@/features/i18n';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser';
import {
  subscribeUserProfileUpdated,
} from '@/services/user/userProfileStore';
import { SafeStorage } from '@/services/storage';
import { getUserStorageKey } from '@/services/user/constants';
import {
  buildHomeSelectedDatePatch,
  readHomeSelectedDateSnapshot,
  updateUserClientState,
} from '@/services/user/clientStateService';
import { fromLocalDateString, toLocalDateString } from '@/services/sync/clientState';
import { queryClient } from '@/services/queryClient';
import { resolveImageUri } from '@/services/imageStorage';

const PROFILE_REFRESH_DEBOUNCE_MS = 250;
const DASHBOARD_FOCUS_REFRESH_STALE_MS = 15_000;
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

const resolveProfileImageForDisplay = (profile: UserProfile): UserProfile => {
  const profileImage = profile.profileImage?.trim();
  if (!profileImage) {
    return profile;
  }

  const resolvedImage = resolveImageUri(profileImage) ?? profileImage;
  if (resolvedImage === profile.profileImage && profile.photoURL === profile.profileImage) {
    return profile;
  }

  return {
    ...profile,
    profileImage: resolvedImage,
    photoURL: resolvedImage,
  };
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
  const profile = SafeStorage.getSync<UserProfile | null>(getUserStorageKey(userId), null);
  return profile ? resolveProfileImageForDisplay(profile) : null;
};

const isRefreshStale = (lastLoadedAtMs: number, refreshWindowMs: number): boolean => {
  if (lastLoadedAtMs <= 0) {
    return true;
  }

  return Date.now() - lastLoadedAtMs >= refreshWindowMs;
};

const consumePendingSelectedDateWrite = (pendingWriteIds: Set<number>): boolean => {
  const pendingWriteResult = pendingWriteIds.values().next();
  if (pendingWriteResult.done) {
    return false;
  }

  pendingWriteIds.delete(pendingWriteResult.value);
  return true;
};

const buildHistoryQueryKey = (userId: string): readonly ['history', string] => ['history', userId] as const;

export const useHomeDashboard = (): UseHomeDashboardReturn => {
  const { t } = useI18n();
  const isFocused = useIsFocused();
  const initialProfileSnapshotRef = useRef<UserProfile | null>(readInitialProfileSnapshot());
  const initialUserId = getCurrentUserIdSnapshot();
  const initialSelectedDate =
    readHomeSelectedDateSnapshot(initialUserId) || new Date();
  const [recentScans, setRecentScans] = useState<AnalysisRecord[]>([]);
  const [allHistoryCache, setAllHistoryCache] = useState<AnalysisRecord[]>([]);
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
  const hasSkippedInitialFocusRefreshRef = useRef(false);
  const lastLoadedAtRef = useRef(0);
  const isFocusedRef = useRef(isFocused);
  const dashboardRefreshTaskRef = useRef<{ cancel?: () => void } | null>(null);
  const hasMissedProfileUpdateRef = useRef(false);
  const shouldRefreshAfterLoadRef = useRef(false);
  const pendingSelectedDateWriteIdsRef = useRef<Set<number>>(new Set<number>());
  const nextSelectedDateWriteIdRef = useRef(0);

  const applyHistorySnapshot = useCallback((allHistory: AnalysisRecord[]): void => {
    setRecentScans(allHistory.slice(0, 3));
    setAllHistoryCache(allHistory);
    setWeeklyStats(buildWeeklyStats(allHistory));
    setSafeCount(allHistory.filter((item) => item.safetyStatus === 'SAFE').length);
  }, []);

  const filteredScans = useMemo(
    () => filterScansByDate(allHistoryCache, selectedDate),
    [allHistoryCache, selectedDate],
  );

  useEffect(() => {
    isFocusedRef.current = isFocused;

    if (isFocused) {
      return;
    }

    if (dashboardRefreshTaskRef.current) {
      dashboardRefreshTaskRef.current.cancel?.();
      dashboardRefreshTaskRef.current = null;
    }

    if (profileRefreshTimerRef.current) {
      clearTimeout(profileRefreshTimerRef.current);
      profileRefreshTimerRef.current = null;
    }
  }, [isFocused]);

  const hydrateProfileFromCache = useCallback(async () => {
    if (profileHydrationInFlightRef.current) {
      return;
    }
    profileHydrationInFlightRef.current = true;
    try {
      const userId = getCurrentUserIdSnapshot();
      const profile = await SafeStorage.get<UserProfile | null>(getUserStorageKey(userId), null);
      if (!profile) return;
      if (!isFocusedRef.current) {
        return;
      }
      const displayProfile = resolveProfileImageForDisplay(profile);

      setUserProfile((previous) => {
        if (!shouldKeepExistingProfileImage(previous, displayProfile)) {
          return displayProfile;
        }
        return {
          ...displayProfile,
          profileImage: previous?.profileImage || displayProfile.profileImage,
          photoURL: previous?.profileImage || displayProfile.profileImage,
        };
      });
      setAllergyCount(getProfileRestrictionCount(displayProfile));
    } catch (error) {
      console.error(error);
    } finally {
      profileHydrationInFlightRef.current = false;
    }
  }, []);

  const loadDashboardData = useCallback(async () => {
    if (loadInFlightRef.current) {
      return;
    }
    loadInFlightRef.current = true;
    try {
      const snapshot = await fetchHomeDashboardData(getCurrentUserIdSnapshot());
      if (!isFocusedRef.current) {
        return;
      }

      const { recentData: fetchedRecent, allHistory, profile, weeklyStats, safeCount } = snapshot;
      lastLoadedAtRef.current = Date.now();

      console.log(`[Dashboard] Loaded: ${allHistory.length} total items from storage`);

      setRecentScans(fetchedRecent);
      setAllHistoryCache(allHistory);
      setWeeklyStats(weeklyStats);
      setSafeCount(safeCount);

      if (profile) {
        const displayProfile = resolveProfileImageForDisplay(profile);
        const syncedSelectedDate = fromLocalDateString(profile.settings.clientState?.home?.selectedDate);
        if (syncedSelectedDate) {
          const syncedKey = toLocalDateString(syncedSelectedDate);
          if (selectedDateKeyRef.current !== syncedKey) {
            selectedDateKeyRef.current = syncedKey;
            setSelectedDateState(syncedSelectedDate);
          }
        }
        setUserProfile((previous) => {
          if (!shouldKeepExistingProfileImage(previous, displayProfile)) {
            return displayProfile;
          }
          return {
            ...displayProfile,
            profileImage: previous?.profileImage || displayProfile.profileImage,
            photoURL: previous?.profileImage || displayProfile.profileImage,
          };
        });
        setAllergyCount(getProfileRestrictionCount(displayProfile));
      }
    } catch (error) {
      console.error(error);
    } finally {
      loadInFlightRef.current = false;
      if (shouldRefreshAfterLoadRef.current && isFocusedRef.current) {
        shouldRefreshAfterLoadRef.current = false;
        hasMissedProfileUpdateRef.current = false;
        void hydrateProfileFromCache();
        void loadDashboardData();
      }
    }
  }, [hydrateProfileFromCache]);

  useEffect(() => {
    if (!isFocused) {
      return undefined;
    }

    const historyQueryKey = buildHistoryQueryKey(getCurrentUserIdSnapshot());
    const syncFromHistoryQueryCache = (): void => {
      if (!isFocusedRef.current) {
        return;
      }

      const records = queryClient.getQueryData<AnalysisRecord[]>(historyQueryKey);
      if (!Array.isArray(records)) {
        return;
      }

      applyHistorySnapshot(records);
    };

    const unsubscribe = queryClient.getQueryCache().subscribe(syncFromHistoryQueryCache);
    syncFromHistoryQueryCache();

    return () => {
      unsubscribe();
    };
  }, [applyHistorySnapshot, isFocused]);

  useEffect(() => {
    let active = true;

    const loadInitialDashboardState = async (): Promise<void> => {
      void hydrateProfileFromCache();
      await loadDashboardData();

      if (
        !active ||
        !isFocusedRef.current ||
        !hasSkippedInitialFocusRefreshRef.current ||
        lastLoadedAtRef.current > 0
      ) {
        return;
      }

      await loadDashboardData();
    };

    if (hasRequestedInitialLoadRef.current) {
      return;
    }
    hasRequestedInitialLoadRef.current = true;
    void loadInitialDashboardState();

    return () => {
      active = false;
    };
  }, [hydrateProfileFromCache, loadDashboardData]);

  useEffect(() => {
    if (dashboardRefreshTaskRef.current) {
      dashboardRefreshTaskRef.current.cancel?.();
      dashboardRefreshTaskRef.current = null;
    }

    if (!isFocused) {
      return;
    }

    const shouldSkipInitialFocusRefresh =
      hasRequestedInitialLoadRef.current &&
      !hasSkippedInitialFocusRefreshRef.current &&
      lastLoadedAtRef.current <= 0;
    const hasMissedProfileUpdate = hasMissedProfileUpdateRef.current;

    if (hasMissedProfileUpdate) {
      void hydrateProfileFromCache();
      if (loadInFlightRef.current) {
        shouldRefreshAfterLoadRef.current = true;
        return;
      }
      hasMissedProfileUpdateRef.current = false;
      shouldRefreshAfterLoadRef.current = false;
      void loadDashboardData();
    } else if (shouldSkipInitialFocusRefresh) {
      hasSkippedInitialFocusRefreshRef.current = true;
    } else if (
      hasRequestedInitialLoadRef.current &&
      isRefreshStale(lastLoadedAtRef.current, DASHBOARD_FOCUS_REFRESH_STALE_MS)
    ) {
      dashboardRefreshTaskRef.current = InteractionManager.runAfterInteractions(() => {
        if (!isFocusedRef.current) {
          return;
        }

        void loadDashboardData();
      });
    }

    return () => {
      if (dashboardRefreshTaskRef.current) {
        dashboardRefreshTaskRef.current.cancel?.();
        dashboardRefreshTaskRef.current = null;
      }
    };
  }, [hydrateProfileFromCache, isFocused, loadDashboardData]);

  useEffect(() => {
    const userId = getCurrentUserIdSnapshot();
    const unsubscribe = subscribeUserProfileUpdated(userId, (reason) => {
      if (reason === 'client_state_write') {
        consumePendingSelectedDateWrite(pendingSelectedDateWriteIdsRef.current);
        return;
      }

      if (!isFocusedRef.current) {
        hasMissedProfileUpdateRef.current = true;
        return;
      }

      if (loadInFlightRef.current) {
        hasMissedProfileUpdateRef.current = true;
        shouldRefreshAfterLoadRef.current = true;
        return;
      }

      if (profileRefreshTimerRef.current) {
        clearTimeout(profileRefreshTimerRef.current);
      }
      profileRefreshTimerRef.current = setTimeout(() => {
        if (!isFocusedRef.current) {
          profileRefreshTimerRef.current = null;
          return;
        }

        void hydrateProfileFromCache();
      }, PROFILE_REFRESH_DEBOUNCE_MS);
    });

    return () => {
      unsubscribe();
      if (profileRefreshTimerRef.current) {
        clearTimeout(profileRefreshTimerRef.current);
        profileRefreshTimerRef.current = null;
      }
    };
  }, [hydrateProfileFromCache]);

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
          messageKey: 'home.alert.deleteFailedRestore',
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
    nextSelectedDateWriteIdRef.current += 1;
    const selectedDateWriteId = nextSelectedDateWriteIdRef.current;
    pendingSelectedDateWriteIdsRef.current.add(selectedDateWriteId);
    const userId = getCurrentUserIdSnapshot();
    void updateUserClientState(userId, buildHomeSelectedDatePatch(date)).catch(() => {
      pendingSelectedDateWriteIdsRef.current.delete(selectedDateWriteId);
    });
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
