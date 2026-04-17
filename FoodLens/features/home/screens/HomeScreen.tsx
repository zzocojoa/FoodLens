import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  Animated,
  BackHandler,
  Image,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { AlertTriangle, Camera, ChevronRight, OctagonAlert, ShieldCheck } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { FloatingEmojis } from '../../../components/FloatingEmojis';
import ProfileSheet from '../../../components/ProfileSheet';
import { SecureImage } from '../../../components/SecureImage';
import { WeeklyStatsStrip } from '../../../components/WeeklyStatsStrip';
import HomeScansSection from '../components/HomeScansSection';
import { useHomeScreenController } from '../hooks/useHomeScreenController';
import { homeStyles as styles } from '../styles/homeStyles';
import {
  countHomeStatusSignals,
  filterScansByHomeStatusSignal,
  HomeStatusSignal,
  HomeStatusVariant,
  resolveHomeStatusVariant,
} from '../utils/homeStatusCard';
import { useI18n } from '@/features/i18n';
import { DEFAULT_FALLBACK_LOCALE } from '@/features/i18n/constants';
import { getCurrentUserIdSnapshot } from '@/services/auth/currentUser';

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
      badgeBackground: '#FCE7F3',
      badgeText: '#E11D63',
      verdictText: '#0F1C78',
      chipBackground: '#FFEDD5',
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

  return t('home.status.chip.allergyTemplate', '알레르기 {count}').replace(
    '{count}',
    String(allergyCount)
  );
};

export default function HomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ openProfile?: string }>();
  const { t, locale } = useI18n();
  const insets = useSafeAreaInsets();
  const {
    colorScheme,
    theme,
    isConnected,
    floatingEmojisRef,
    orbAnim,
    dashboard,
    handleOpenProfile,
    handleOpenEmojiPicker,
    handleStartAnalysis,
    handleOpenHistory,
    handleOpenResult,
  } = useHomeScreenController();
  const {
    activeModal,
    allergyCount,
    filteredScans,
    selectedDate,
    userProfile,
    weeklyStats,
    setActiveModal,
    setSelectedDate,
    loadDashboardData,
    handleDeleteItem,
  } = dashboard;
  const [activeSignal, setActiveSignal] = React.useState<HomeStatusSignal | null>(null);
  const cameraOrbBottom = Math.max(40, insets.bottom + 16);
  const profileImageUri = userProfile?.profileImage?.trim() || undefined;
  const hasConsumedOpenProfileParamRef = React.useRef(false);

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
        { caution: statusCounts.caution, danger: statusCounts.danger },
        allergyCount
      ),
    [allergyCount, statusCounts.caution, statusCounts.danger, statusVariant, t]
  );
  const signalDateLabel = React.useMemo(() => {
    return new Intl.DateTimeFormat(locale || DEFAULT_FALLBACK_LOCALE, {
      month: 'short',
      day: 'numeric',
    }).format(selectedDate);
  }, [locale, selectedDate]);
  const visibleScans = React.useMemo(
    () => filterScansByHomeStatusSignal(filteredScans, activeSignal),
    [activeSignal, filteredScans]
  );

  React.useEffect(() => {
    setActiveSignal(null);
  }, [selectedDate]);

  const handleSignalPress = React.useCallback((signal: HomeStatusSignal) => {
    setActiveSignal((previous) => (previous === signal ? null : signal));
  }, []);

  React.useEffect(() => {
    if (params.openProfile !== '1') {
      hasConsumedOpenProfileParamRef.current = false;
      return;
    }
    if (hasConsumedOpenProfileParamRef.current) {
      return;
    }
    hasConsumedOpenProfileParamRef.current = true;
    setActiveModal('PROFILE');
    router.setParams({ openProfile: undefined });
  }, [params.openProfile, router, setActiveModal]);

  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS !== 'android' || activeModal !== 'PROFILE') {
        return undefined;
      }

      const onBackPress = () => {
        setActiveModal('NONE');
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => {
        subscription.remove();
      };
    }, [activeModal, setActiveModal])
  );

  const homeBackgroundColor = colorScheme === 'light' ? '#FFFFFF' : theme.background;

  return (
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
            <Pressable
              onPress={handleOpenProfile}
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1 }]}
              hitSlop={20}
            >
              <View style={styles.avatarContainer} pointerEvents="none">
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
            </Pressable>
            <View>
              <Text style={[styles.welcomeText, { color: theme.textSecondary }]}>
                {t('home.greeting.welcomeBack', 'Welcome back,')}
              </Text>
              <Text style={[styles.userName, { color: theme.textPrimary }]}>
                {userProfile?.name || t('home.greeting.defaultName', 'Traveler Joy')} ✈️
              </Text>
            </View>
          </View>

          <Pressable
            onPress={handleOpenEmojiPicker}
            style={({ pressed }) => [styles.emojiPickerButton, { opacity: pressed ? 0.6 : 1 }]}
            hitSlop={10}
          >
            <View pointerEvents="none">
              <Image
                source={require('../../../assets/images/emoji-picker-icon.png')}
                style={{ width: 28, height: 28, tintColor: theme.textPrimary }}
                resizeMode="contain"
              />
            </View>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingBottom: 120 + insets.bottom, paddingHorizontal: 24 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.statusCard,
              {
                backgroundColor: colorScheme === 'light' ? '#FFFFFF' : theme.surface,
                borderColor:
                  colorScheme === 'light'
                    ? 'rgba(198, 197, 212, 0.34)'
                    : theme.glassBorder,
                shadowColor: theme.shadow,
              },
            ]}
          >
            <View style={[styles.statusGlow, { backgroundColor: statusPalette.glow }]} />

            <View style={styles.statusHead}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusPalette.badgeBackground },
                ]}
              >
                <Text style={[styles.statusBadgeText, { color: statusPalette.badgeText }]}>
                  {t('home.status.badge', '오늘 상태')}
                </Text>
              </View>
              <Text style={[styles.statusDate, { color: theme.textSecondary }]}>
                {signalDateLabel}
              </Text>
            </View>

            <Text style={[styles.statusVerdict, { color: statusPalette.verdictText }]}>
              {statusLabel}
            </Text>

            <View style={styles.statusPillStack}>
              <Pressable
                onPress={() => handleSignalPress('SAFE')}
                style={({ pressed }) => [
                  styles.statusPill,
                  styles.statusPillSafe,
                  activeSignal === 'SAFE' && styles.statusPillActive,
                  pressed && styles.statusPillPressed,
                ]}
              >
                <View style={styles.statusPillMain}>
                  <View style={styles.statusPillIconSafe}>
                    <ShieldCheck size={18} color="#006C1B" />
                  </View>
                  <Text style={[styles.statusPillLabel, { color: '#006C1B' }]}>
                    {statusCounts.safe} {t('home.status.pill.safe', '안전')}
                  </Text>
                </View>
                <ChevronRight size={18} color="rgba(0,108,27,0.46)" />
              </Pressable>

              <Pressable
                onPress={() => handleSignalPress('CAUTION')}
                style={({ pressed }) => [
                  styles.statusPill,
                  styles.statusPillCaution,
                  activeSignal === 'CAUTION' && styles.statusPillActive,
                  pressed && styles.statusPillPressed,
                ]}
              >
                <View style={styles.statusPillMain}>
                  <View style={styles.statusPillIconCaution}>
                    <AlertTriangle size={18} color="#8B6E00" />
                  </View>
                  <Text style={[styles.statusPillLabel, { color: '#8B6E00' }]}>
                    {statusCounts.caution} {t('home.status.pill.caution', '주의')}
                  </Text>
                </View>
                <ChevronRight size={18} color="rgba(139,110,0,0.46)" />
              </Pressable>

              <Pressable
                onPress={() => handleSignalPress('DANGER')}
                style={({ pressed }) => [
                  styles.statusPill,
                  styles.statusPillRisk,
                  activeSignal === 'DANGER' && styles.statusPillActive,
                  pressed && styles.statusPillPressed,
                ]}
              >
                <View style={styles.statusPillMain}>
                  <View style={styles.statusPillIconRisk}>
                    <OctagonAlert size={18} color="#8E8E97" />
                  </View>
                  <Text style={[styles.statusPillLabel, { color: '#8E8E97' }]}>
                    {statusCounts.danger} {t('home.status.pill.danger', '위험')}
                  </Text>
                </View>
                <ChevronRight size={18} color="rgba(142,142,151,0.46)" />
              </Pressable>
            </View>

            <View
              style={[
                styles.statusChip,
                {
                  backgroundColor: statusPalette.chipBackground,
                },
              ]}
            >
              <Text style={[styles.statusChipText, { color: statusPalette.chipText }]}>
                {statusChipLabel}
              </Text>
            </View>
          </View>

          <View style={{ marginBottom: 8 }}>
            <WeeklyStatsStrip
              weeklyData={weeklyStats}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </View>

          <HomeScansSection
            filteredScans={visibleScans}
            selectedDate={selectedDate}
            theme={theme}
            onOpenHistory={handleOpenHistory}
            onOpenResult={handleOpenResult}
            onDeleteItem={handleDeleteItem}
            t={t}
            locale={locale}
          />
        </ScrollView>

        <ProfileSheet
          isOpen={activeModal === 'PROFILE'}
          onClose={() => setActiveModal('NONE')}
          userId={getCurrentUserIdSnapshot()}
          onUpdate={loadDashboardData}
        />
      </SafeAreaView>

      <Animated.View
        style={[
          styles.orbContainer,
          {
            opacity: orbAnim,
            bottom: cameraOrbBottom,
            transform: [{ scale: orbAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) }],
          },
        ]}
        pointerEvents={activeModal === 'PROFILE' ? 'none' : 'box-none'}
      >
        <View
          style={[{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }, { alignItems: 'center', justifyContent: 'center' }]}
          pointerEvents="none"
        >
          <FloatingEmojis ref={floatingEmojisRef} />
        </View>

        <TouchableOpacity onPress={handleStartAnalysis} activeOpacity={0.8} style={styles.cameraButtonShadow}>
          <LinearGradient colors={['#3B82F6', '#2563EB']} style={styles.cameraButton} pointerEvents="none">
            <Camera color="white" size={32} />
          </LinearGradient>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}
