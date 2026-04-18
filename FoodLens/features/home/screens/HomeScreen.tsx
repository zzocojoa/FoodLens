import { StatusBar } from 'expo-status-bar';
import React from 'react';
import { AlertTriangle, ArrowRight, ChevronRight, OctagonAlert, ShieldCheck } from 'lucide-react-native';
import {
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FoodThumbnail } from '../../../components/FoodThumbnail';
import { HapticTouchableOpacity } from '../../../components/HapticFeedback';
import { SecureImage } from '../../../components/SecureImage';
import TopLevelScreenShell, {
  getTopLevelScreenBottomPadding,
} from '../../../components/navigation/TopLevelScreenShell';
import { useHomeScreenController } from '../hooks/useHomeScreenController';
import { homeStyles as styles } from '../styles/homeStyles';
import { isSameDay } from '../utils/homeDashboard';
import { getHomeScanStatusBadge } from '../utils/homeUi';
import {
  countHomeStatusSignals,
  filterScansByHomeStatusSignal,
  HomeStatusSignal,
  HomeStatusVariant,
  resolveHomeStatusVariant,
} from '../utils/homeStatusCard';
import { getLocalizedFoodName } from '../utils/localizedFoodName';
import { useI18n } from '@/features/i18n';
import { DEFAULT_FALLBACK_LOCALE } from '@/features/i18n/constants';
import { getBarcodeImageUri, resolveImageUri } from '@/services/imageStorage';
import { formatDate, getEmoji } from '@/services/utils';

const getStatusPalette = (
  variant: HomeStatusVariant
): {
  badgeBackground: string;
  badgeText: string;
  verdictText: string;
  chipBackground: string;
  chipText: string;
  glow: string;
} => {
  if (variant === 'SAFE') {
    return {
      badgeBackground: '#DCFCE7',
      badgeText: '#166534',
      verdictText: '#0F1C78',
      chipBackground: '#DCFCE7',
      chipText: '#166534',
      glow: 'rgba(145, 247, 142, 0.16)',
    };
  }

  if (variant === 'DANGER') {
    return {
      badgeBackground: '#FFE4E6',
      badgeText: '#BE123C',
      verdictText: '#0F1C78',
      chipBackground: '#FFE4E6',
      chipText: '#BE123C',
      glow: 'rgba(244, 63, 94, 0.14)',
    };
  }

  if (variant === 'CAUTION') {
    return {
      badgeBackground: '#FEF3C7',
      badgeText: '#B45309',
      verdictText: '#0F1C78',
      chipBackground: '#FEF3C7',
      chipText: '#B45309',
      glow: 'rgba(251, 191, 36, 0.16)',
    };
  }

  return {
    badgeBackground: '#E2E8F0',
    badgeText: '#64748B',
    verdictText: '#0F1C78',
    chipBackground: '#E2E8F0',
    chipText: '#64748B',
    glow: 'rgba(148, 163, 184, 0.14)',
  };
};

const getStatusLabel = (
  t: (key: string, fallback?: string) => string,
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
  t: (key: string, fallback?: string) => string,
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

  return t('home.status.chip.safe', '안정');
};

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const {
    colorScheme,
    theme,
    isConnected,
    dashboard,
    handleOpenResult,
  } = useHomeScreenController();
  const {
    allergyCount,
    filteredScans,
    recentScans,
    selectedDate,
    userProfile,
    setSelectedDate,
  } = dashboard;
  const [activeSignal, setActiveSignal] = React.useState<HomeStatusSignal | null>(null);
  const profileImageUri = userProfile?.profileImage?.trim() || undefined;
  const statusCounts = React.useMemo(
    () => countHomeStatusSignals(filteredScans),
    [filteredScans]
  );
  const statusVariant = React.useMemo(
    () => resolveHomeStatusVariant(statusCounts),
    [statusCounts]
  );
  const statusPalette = React.useMemo(
    () => getStatusPalette(statusVariant),
    [statusVariant]
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

  const homeBackgroundColor = colorScheme === 'light' ? '#FFFFFF' : theme.background;
  const visibleRecentScans = React.useMemo(() => {
    if (activeSignal === null) {
      return recentScans;
    }

    return filterScansByHomeStatusSignal(filteredScans, activeSignal);
  }, [activeSignal, filteredScans, recentScans]);
  const featuredRecentScan = visibleRecentScans[0] ?? recentScans[0] ?? null;
  const signalDateLabel = new Intl.DateTimeFormat(locale || DEFAULT_FALLBACK_LOCALE, {
    month: 'short',
    day: 'numeric',
  }).format(selectedDate);
  const cardSurfaceStyle = {
    backgroundColor: colorScheme === 'light' ? '#FFFFFF' : theme.glass,
    borderColor:
      colorScheme === 'light' ? 'rgba(198, 197, 212, 0.34)' : theme.glassBorder,
    shadowColor: theme.shadow,
  };
  const featuredFoodName = featuredRecentScan ? getLocalizedFoodName(featuredRecentScan, locale) : null;
  const featuredBadge = featuredRecentScan
    ? getHomeScanStatusBadge(featuredRecentScan.safetyStatus)
    : null;
  const featuredImageUri = featuredRecentScan
    ? featuredRecentScan.isBarcode
      ? getBarcodeImageUri()
      : (resolveImageUri(featuredRecentScan.imageUri) || undefined)
    : undefined;

  React.useEffect(() => {
    setActiveSignal(null);
  }, [selectedDate]);

  React.useEffect(() => {
    const today = new Date();

    if (!isSameDay(selectedDate, today)) {
      setSelectedDate(today);
    }
  }, [selectedDate, setSelectedDate]);

  const handleSignalPress = React.useCallback((signal: HomeStatusSignal) => {
    setActiveSignal((previous) => (previous === signal ? null : signal));
  }, []);

  return (
    <TopLevelScreenShell
      activeItem="home"
      backgroundColor={homeBackgroundColor}
      hideNav={false}
    >
      <View style={[styles.container, { backgroundColor: homeBackgroundColor }]}>
        <View style={styles.backgroundContainer} />

        <SafeAreaView style={{ flex: 1, backgroundColor: homeBackgroundColor }} edges={['top']}>
          <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

          {isConnected === false && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineText}>
                {t('home.offline.cachedMode', 'Offline Mode: Using cached data')}
              </Text>
            </View>
          )}

          <View style={[styles.header, { paddingHorizontal: 24 }]}>
            <View style={styles.userInfo}>
              <View style={styles.avatarContainer}>
                {profileImageUri ? (
                  <SecureImage
                    source={{ uri: profileImageUri }}
                    style={styles.avatar}
                    fallbackIconSize={20}
                  />
                ) : (
                  <View
                    style={[
                      styles.avatar,
                      {
                        backgroundColor: colorScheme === 'dark' ? theme.surface : '#E2E8F0',
                      },
                    ]}
                  />
                )}
              </View>
              <View>
                <Text style={[styles.welcomeText, { color: theme.textSecondary }]}>
                  {t('home.greeting.welcomeBack', 'Welcome back,')}
                </Text>
                <Text style={[styles.userName, { color: theme.textPrimary }]}>
                  {userProfile?.name || t('home.greeting.defaultName', 'Traveler Joy')} ✈️
                </Text>
              </View>
            </View>

          </View>

          <ScrollView
            contentContainerStyle={{
              paddingBottom: homeContentBottomPadding,
              paddingHorizontal: 24,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.topfoldSection}>
              <View style={[styles.signalCard, cardSurfaceStyle]}>
                <View style={[styles.statusGlow, { backgroundColor: statusPalette.glow }]} />

              <View style={styles.signalHeaderRow}>
                <View style={[styles.statusKicker, { backgroundColor: statusPalette.badgeBackground }]}>
                  <Text style={[styles.statusKickerText, { color: statusPalette.badgeText }]}>
                    {t('home.status.badge', '오늘 상태')}
                  </Text>
                </View>
                <Text style={[styles.signalDateLabel, { color: theme.textSecondary }]}>
                  {signalDateLabel}
                </Text>
              </View>

              <Text style={[styles.signalHeadline, { color: statusPalette.verdictText }]}>
                {statusLabel}
              </Text>

              <View style={styles.metricPillStack}>
                <Pressable
                  onPress={() => handleSignalPress('SAFE')}
                  style={({ pressed }) => [
                    styles.metricPill,
                    styles.metricPillSafe,
                    activeSignal === 'SAFE' && styles.metricPillActive,
                    pressed && styles.metricPillPressed,
                  ]}
                >
                  <View style={styles.metricPillMain}>
                    <View style={styles.metricPillIconSafe}>
                      <ShieldCheck color="#166534" size={16} strokeWidth={2.3} />
                    </View>
                    <Text style={[styles.metricPillValue, styles.metricPillSafeText]}>
                      {statusCounts.safe} {t('home.status.pill.safe', '안전')}
                    </Text>
                  </View>
                  <ChevronRight color="rgba(22, 101, 52, 0.55)" size={18} strokeWidth={2.4} />
                </Pressable>

                <Pressable
                  onPress={() => handleSignalPress('CAUTION')}
                  style={({ pressed }) => [
                    styles.metricPill,
                    styles.metricPillCaution,
                    activeSignal === 'CAUTION' && styles.metricPillActive,
                    pressed && styles.metricPillPressed,
                  ]}
                >
                  <View style={styles.metricPillMain}>
                    <View style={styles.metricPillIconCaution}>
                      <AlertTriangle color="#B45309" size={16} strokeWidth={2.3} />
                    </View>
                    <Text style={[styles.metricPillValue, styles.metricPillCautionText]}>
                      {statusCounts.caution} {t('home.status.pill.caution', '주의')}
                    </Text>
                  </View>
                  <ChevronRight color="rgba(180, 83, 9, 0.55)" size={18} strokeWidth={2.4} />
                </Pressable>

                <Pressable
                  onPress={() => handleSignalPress('DANGER')}
                  style={({ pressed }) => [
                    styles.metricPill,
                    styles.metricPillDanger,
                    activeSignal === 'DANGER' && styles.metricPillActive,
                    pressed && styles.metricPillPressed,
                  ]}
                >
                  <View style={styles.metricPillMain}>
                    <View style={styles.metricPillIconDanger}>
                      <OctagonAlert color="#BE123C" size={16} strokeWidth={2.3} />
                    </View>
                    <Text style={[styles.metricPillValue, styles.metricPillDangerText]}>
                      {statusCounts.danger} {t('home.status.pill.danger', '위험')}
                    </Text>
                  </View>
                  <ChevronRight color="rgba(190, 18, 60, 0.55)" size={18} strokeWidth={2.4} />
                </Pressable>
              </View>

              <View style={[styles.statusSignalChip, { backgroundColor: statusPalette.chipBackground }]}>
                <Text style={[styles.statusSignalChipText, { color: statusPalette.chipText }]}>
                  {statusChipLabel}
                </Text>
              </View>
            </View>

              {featuredRecentScan && featuredFoodName && featuredBadge ? (
                <HapticTouchableOpacity
                  activeOpacity={0.9}
                  hapticType="selection"
                  onPress={() => handleOpenResult(featuredRecentScan)}
                  style={[styles.featuredScanCard, cardSurfaceStyle]}
                >
                  <View style={styles.featuredScanMedia}>
                    <FoodThumbnail
                      uri={featuredImageUri}
                      emoji={getEmoji(featuredFoodName)}
                      style={styles.featuredScanThumbnail}
                      imageStyle={styles.featuredScanThumbnailImage}
                      fallbackFontSize={42}
                    />
                    <View
                      style={[
                        styles.featuredScanBadge,
                        { backgroundColor: featuredBadge.backgroundColor },
                      ]}
                    >
                      <Text
                        style={[
                          styles.featuredScanBadgeText,
                          { color: featuredBadge.textColor },
                        ]}
                      >
                        {featuredBadge.label}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.featuredScanBody}>
                    <View style={styles.featuredScanCopy}>
                      <Text style={[styles.featuredScanEyebrow, { color: theme.textSecondary }]}>
                        {t('home.scans.featuredTitle', '가장 최근 판단')}
                      </Text>
                      <Text style={[styles.featuredScanName, { color: theme.textPrimary }]}>
                        {featuredFoodName}
                      </Text>
                      <Text style={[styles.featuredScanMeta, { color: theme.textSecondary }]}>
                        {formatDate(featuredRecentScan.timestamp, locale)}
                      </Text>
                    </View>

                    <View style={[styles.featuredScanAction, { backgroundColor: theme.surface }]}>
                      <ArrowRight color={theme.textPrimary} size={18} strokeWidth={2.4} />
                    </View>
                  </View>
                </HapticTouchableOpacity>
              ) : null}
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </TopLevelScreenShell>
  );
}
