import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { completeTopLevelTabSwitchTrace } from '../../../components/navigation/tabSwitchTrace';
import TopLevelScreenShell, {
  getTopLevelScreenBottomPadding,
} from '../../../components/navigation/TopLevelScreenShell';
import HomeBackgroundAtmosphere from '../components/HomeBackgroundAtmosphere';
import HomeFeaturedScan from '../components/HomeFeaturedScan';
import HomeHeroVerdict from '../components/HomeHeroVerdict';
import HomeQuickActions from '../components/HomeQuickActions';
import HomeRecentFeed from '../components/HomeRecentFeed';
import { HomeStatusRail } from '../components/HomeStatusRail';
import HomeWeekPulse from '../components/HomeWeekPulse';
import {
  getHomeDashboardColors,
  homeDashboardColors,
  type HomeDashboardColorScheme,
} from '../components/homeDashboardTokens';
import { useHomeScreenController } from '../hooks/useHomeScreenController';
import { isSameDay } from '../utils/homeDashboard';
import {
  countHomeStatusSignals,
  filterScansByHomeStatusSignal,
  HomeStatusCounts,
  HomeStatusSignal,
  HomeStatusVariant,
  resolveHomeStatusVariant,
} from '../utils/homeStatusCard';
import { useI18n } from '@/features/i18n';
import { DEFAULT_FALLBACK_LOCALE } from '@/features/i18n/constants';
import { useColorScheme } from '@/hooks/use-color-scheme';
type TranslationFunction = (key: string, fallback?: string) => string;

const getStatusLabel = (
  t: TranslationFunction,
  variant: HomeStatusVariant
): string => {
  if (variant === 'SAFE') {
    return t('home.status.verdict.safe', '안전');
  }

  if (variant === 'DANGER') {
    return t('home.status.verdict.danger', '위험');
  }

  if (variant === 'CAUTION') {
    return t('home.status.verdict.caution', '주의');
  }

  return t('home.status.verdict.empty', '없음');
};

const getStatusChipLabel = (
  t: TranslationFunction,
  variant: HomeStatusVariant,
  counts: {
    caution: number;
    danger: number;
  },
  allergyCount: number
): string => {
  if (variant === 'EMPTY') {
    return t('home.status.chip.empty', '기록 없음');
  }

  if (variant === 'DANGER') {
    return t('home.status.chip.dangerTemplate', '위험 {count}').replace(
      '{count}',
      String(counts.danger)
    );
  }

  if (variant === 'CAUTION') {
    return t('home.status.chip.recheckTemplate', '재확인 {count}').replace(
      '{count}',
      String(counts.caution)
    );
  }

  if (allergyCount > 0) {
    return t('home.status.chip.allergyTemplate', '알레르기 {count}').replace(
      '{count}',
      String(allergyCount)
    );
  }

  return t('home.status.chip.safe', 'Safe');
};

const formatCountValue = (value: number): string => {
  return String(value).padStart(2, '0');
};

const getSelectedWeekActivityCount = (
  selectedDate: Date,
  weeklyStats: { date: Date; hasData: boolean }[],
): number => {
  const weekStart = new Date(selectedDate);
  weekStart.setDate(selectedDate.getDate() - selectedDate.getDay());
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  return weeklyStats.filter((item) => {
    const itemTime = item.date.getTime();
    return item.hasData && itemTime >= weekStart.getTime() && itemTime <= weekEnd.getTime();
  }).length;
};

const getRailStatusLabel = (
  isConnected: boolean,
  t: TranslationFunction,
): string => {
  if (isConnected) {
    return t('home.rail.online', 'Sync ready');
  }

  return t('home.rail.offline', 'Cached data');
};

const getQuickActionCopy = (
  allergyCount: number,
  recentScansCount: number,
  selectedWeekActivityCount: number,
  t: TranslationFunction,
): {
  allergiesDescription: string;
  allergiesValue: string;
  historyDescription: string;
  historyValue: string;
  tripStatsDescription: string;
  tripStatsValue: string;
} => {
  return {
    allergiesDescription: t(
      'home.quickActions.allergiesDescription',
      'Review blockers saved in your safety profile.',
    ),
    allergiesValue: formatCountValue(allergyCount),
    historyDescription: t(
      'home.quickActions.historyDescription',
      'Open your recent scan log before your next meal.',
    ),
    historyValue: formatCountValue(recentScansCount),
    tripStatsDescription: t(
      'home.quickActions.tripStatsDescription',
      'Check safe meals logged across your current trip.',
    ),
    tripStatsValue: formatCountValue(selectedWeekActivityCount),
  };
};

export default function HomeScreen() {
  const isFocused = useIsFocused();
  const colorScheme = (useColorScheme() ?? 'light') as HomeDashboardColorScheme;
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const {
    isConnected,
    dashboard,
    handleOpenAllergies,
    handleOpenHistory,
    handleOpenResult,
    handleOpenTripStats,
  } = useHomeScreenController();
  const {
    allergyCount,
    filteredScans,
    handleDeleteItem,
    recentScans,
    selectedDate,
    userProfile,
    setSelectedDate,
    weeklyStats,
  } = dashboard;
  const resolvedLocale = locale || DEFAULT_FALLBACK_LOCALE;
  const [activeSignal, setActiveSignal] = React.useState<HomeStatusSignal | null>(null);
  const profileImageUri = userProfile?.profileImage?.trim() || undefined;
  const displayName = userProfile?.name || t('home.greeting.defaultName', 'Traveler Joy');
  const statusCounts: HomeStatusCounts = React.useMemo(
    () => countHomeStatusSignals(filteredScans),
    [filteredScans]
  );
  const statusVariant = React.useMemo(
    () => resolveHomeStatusVariant(statusCounts),
    [statusCounts]
  );
  const statusLabel = React.useMemo(
    () => getStatusLabel(t, statusVariant),
    [statusVariant, t]
  );
  const statusChipLabel = React.useMemo(
    () =>
      getStatusChipLabel(
        t,
        statusVariant,
        {
          caution: statusCounts.caution,
          danger: statusCounts.danger,
        },
        allergyCount
      ),
    [allergyCount, statusCounts.caution, statusCounts.danger, statusVariant, t]
  );
  const homeContentBottomPadding =
    getTopLevelScreenBottomPadding(insets.bottom, 24);

  const dashboardColors = React.useMemo(
    () => getHomeDashboardColors(colorScheme),
    [colorScheme],
  );
  const homeBackgroundColor = dashboardColors.paper;
  const visibleRecentScans = React.useMemo(() => {
    if (activeSignal === null) {
      return recentScans;
    }

    return filterScansByHomeStatusSignal(filteredScans, activeSignal);
  }, [activeSignal, filteredScans, recentScans]);
  const featuredRecentScan = React.useMemo(() => {
    if (activeSignal !== null) {
      return visibleRecentScans[0] ?? null;
    }

    return recentScans[0] ?? null;
  }, [activeSignal, recentScans, visibleRecentScans]);
  const signalDateLabel = new Intl.DateTimeFormat(resolvedLocale, {
    month: 'short',
    day: 'numeric',
  }).format(selectedDate);
  const railStatusLabel = React.useMemo(
    () => getRailStatusLabel(isConnected, t),
    [isConnected, t],
  );
  const selectedWeekActivityCount = React.useMemo(
    () => getSelectedWeekActivityCount(selectedDate, weeklyStats),
    [selectedDate, weeklyStats],
  );
  const quickActionCopy = React.useMemo(
    () => getQuickActionCopy(
      allergyCount,
      recentScans.length,
      selectedWeekActivityCount,
      t,
    ),
    [allergyCount, recentScans.length, selectedWeekActivityCount, t],
  );

  React.useEffect(() => {
    setActiveSignal(null);
  }, [selectedDate]);

  React.useEffect(() => {
    if (!isFocused) {
      return;
    }

    completeTopLevelTabSwitchTrace({
      target: 'home',
      details: {
        filteredScansCount: filteredScans.length,
        hasProfile: userProfile !== null,
        recentScansCount: recentScans.length,
      },
    });
  }, [filteredScans.length, isFocused, recentScans.length, userProfile]);

  React.useEffect(() => {
    if (!isFocused) {
      return;
    }

    const today = new Date();

    if (!isSameDay(selectedDate, today)) {
      setSelectedDate(today);
    }
  }, [isFocused, selectedDate, setSelectedDate]);

  const handleSignalPress = React.useCallback((signal: HomeStatusSignal) => {
    setActiveSignal((previous) => (previous === signal ? null : signal));
  }, []);

  return (
    <TopLevelScreenShell
      activeItem="home"
      backgroundColor={homeBackgroundColor}
      hideNav={false}
    >
      <View testID="home-screen" style={[screenStyles.container, { backgroundColor: homeBackgroundColor }]}>
        {colorScheme === 'light' ? <HomeBackgroundAtmosphere /> : null}
        <SafeAreaView style={[screenStyles.safeArea, { backgroundColor: homeBackgroundColor }]} edges={['top']}>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
          <ScrollView
            contentInsetAdjustmentBehavior="automatic"
            contentContainerStyle={[
              screenStyles.scrollContent,
              { paddingBottom: homeContentBottomPadding },
            ]}
            showsVerticalScrollIndicator={false}
          >
            <HomeStatusRail
              contextCopy={t('home.rail.context', 'Traveler safety desk')}
              displayName={displayName}
              isConnected={isConnected}
              profileImageUri={profileImageUri}
              statusLabel={railStatusLabel}
              colors={dashboardColors}
              colorScheme={colorScheme}
            />
            <HomeHeroVerdict
              t={t}
              signalDateLabel={signalDateLabel}
              statusLabel={statusLabel}
              statusChipLabel={statusChipLabel}
              activeSignal={activeSignal}
              statusCounts={statusCounts}
              onSignalPress={handleSignalPress}
              colors={dashboardColors}
              colorScheme={colorScheme}
            />
            <HomeQuickActions
              allergiesDescription={quickActionCopy.allergiesDescription}
              allergiesTitle={t('bottomNav.allergies', 'Allergies')}
              allergiesValue={quickActionCopy.allergiesValue}
              historyDescription={quickActionCopy.historyDescription}
              historyTitle={t('bottomNav.history', 'History')}
              historyValue={quickActionCopy.historyValue}
              tripStatsDescription={quickActionCopy.tripStatsDescription}
              tripStatsTitle={t('home.quickActions.tripStatsTitle', 'Trip Stats')}
              tripStatsValue={quickActionCopy.tripStatsValue}
              onOpenAllergies={handleOpenAllergies}
              onOpenHistory={handleOpenHistory}
              onOpenTripStats={handleOpenTripStats}
              colors={dashboardColors}
              colorScheme={colorScheme}
            />
            <HomeWeekPulse
              colors={dashboardColors}
              colorScheme={colorScheme}
              locale={resolvedLocale}
              metaLabel={t('home.weekPulse.meta', 'Read only')}
              selectedDate={selectedDate}
              title={t('home.weekPulse.title', 'Week pulse')}
              weeklyStats={weeklyStats}
            />
            <HomeFeaturedScan
              colors={dashboardColors}
              colorScheme={colorScheme}
              item={featuredRecentScan}
              locale={resolvedLocale}
              t={t}
              onOpenResult={handleOpenResult}
            />
            <HomeRecentFeed
              colors={dashboardColors}
              colorScheme={colorScheme}
              items={visibleRecentScans}
              title={t('home.scans.recentTitle', 'Recent Scans')}
              meta={t('home.recentFeed.meta', 'Swipe to delete')}
              locale={resolvedLocale}
              t={t}
              onOpenResult={handleOpenResult}
              onDeleteItem={handleDeleteItem}
              onOpenHistory={handleOpenHistory}
            />
          </ScrollView>
        </SafeAreaView>
      </View>
    </TopLevelScreenShell>
  );
}

const screenStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: homeDashboardColors.paper,
  },
  safeArea: {
    flex: 1,
    backgroundColor: homeDashboardColors.paper,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    gap: 14,
  },
});
