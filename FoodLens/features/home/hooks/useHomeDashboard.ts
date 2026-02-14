import { useCallback, useEffect, useState } from 'react';
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
import { CURRENT_USER_ID } from '@/services/auth/currentUser';

const TEST_UID = CURRENT_USER_ID;

type UseHomeDashboardReturn = {
  activeModal: HomeModalType;
  allergyCount: number;
  filteredScans: AnalysisRecord[];
  safeCount: number;
  selectedDate: Date;
  userProfile: UserProfile | null;
  weeklyStats: WeeklyData[];
  setActiveModal: (modal: HomeModalType) => void;
  setSelectedDate: (date: Date) => void;
  loadDashboardData: () => Promise<void>;
  handleDeleteItem: (itemId: string) => Promise<void>;
};

export const useHomeDashboard = (): UseHomeDashboardReturn => {
  const { t } = useI18n();
  const [recentScans, setRecentScans] = useState<AnalysisRecord[]>([]);
  const [allHistoryCache, setAllHistoryCache] = useState<AnalysisRecord[]>([]);
  const [filteredScans, setFilteredScans] = useState<AnalysisRecord[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [weeklyStats, setWeeklyStats] = useState<WeeklyData[]>([]);
  const [allergyCount, setAllergyCount] = useState(0);
  const [safeCount, setSafeCount] = useState(0);
  const [activeModal, setActiveModal] = useState<HomeModalType>('NONE');
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    setFilteredScans(filterScansByDate(allHistoryCache, selectedDate));
  }, [allHistoryCache, selectedDate]);

  const loadDashboardData = useCallback(async () => {
    try {
      const snapshot = await fetchHomeDashboardData(TEST_UID);
      const { recentData: fetchedRecent, allHistory, profile, weeklyStats, safeCount } = snapshot;

      console.log(`[Dashboard] Loaded: ${allHistory.length} total items from storage`);

      setRecentScans(fetchedRecent);
      setAllHistoryCache(allHistory);
      setWeeklyStats(weeklyStats);
      setSafeCount(safeCount);

      if (profile) {
        setUserProfile(profile);
        setAllergyCount(getProfileRestrictionCount(profile));
      }
    } catch (error) {
      console.error(error);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      const task = InteractionManager.runAfterInteractions(() => {
        loadDashboardData();
      });
      return () => task.cancel();
    }, [loadDashboardData]),
  );

  const handleDeleteItem = useCallback(
    async (itemId: string) => {
      const previousScans = [...recentScans];

      try {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setRecentScans((prev) => prev.filter((item) => item.id !== itemId));
        await AnalysisService.deleteAnalysis(TEST_UID, itemId);
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

  return {
    activeModal,
    allergyCount,
    filteredScans,
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
