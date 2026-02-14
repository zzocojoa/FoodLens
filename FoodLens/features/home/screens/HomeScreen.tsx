import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Camera, Heart, ShieldCheck } from 'lucide-react-native';

import { THEME } from '../../../constants/theme';
import { FloatingEmojis } from '../../../components/FloatingEmojis';
import { HapticTouchableOpacity } from '../../../components/HapticFeedback';
import ProfileSheet from '../../../components/ProfileSheet';
import SpatialApple from '../../../components/SpatialApple';
import { SecureImage } from '../../../components/SecureImage';
import { WeeklyStatsStrip } from '../../../components/WeeklyStatsStrip';
import HomeScansSection from '../components/HomeScansSection';
import { useHomeScreenController } from '../hooks/useHomeScreenController';
import { homeStyles as styles } from '../styles/homeStyles';
import { useI18n } from '@/features/i18n';
import { CURRENT_USER_ID } from '@/services/auth/currentUser';

export default function HomeScreen() {
  const { t, locale } = useI18n();
  const {
    colorScheme,
    theme,
    isConnected,
    floatingEmojisRef,
    orbAnim,
    dashboard,
    handleAppleMotion,
    handleOpenProfile,
    handleOpenEmojiPicker,
    handleStartAnalysis,
    handleOpenHistory,
    handleOpenResult,
    handleOpenTripStats,
    handleOpenAllergies,
  } = useHomeScreenController();
  const {
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
  } = dashboard;

  return (
    <View style={styles.container}>
      <View style={styles.backgroundContainer} />

      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
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
                <SecureImage
                  source={{
                    uri:
                      userProfile?.profileImage ||
                      'https://api.dicebear.com/7.x/avataaars/png?seed=Felix',
                  }}
                  style={styles.avatar}
                  fallbackIconSize={20}
                />
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
          contentContainerStyle={{ paddingBottom: 120, paddingHorizontal: 24 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.heroCard,
              THEME.glass,
              {
                backgroundColor: theme.glass,
                borderColor: theme.glassBorder,
                shadowColor: theme.shadow,
              },
            ]}
          >
            <View style={styles.heroGlow} />
            <View style={styles.heroEmoji}>
              <SpatialApple
                size={100}
                emoji={userProfile?.settings?.selectedEmoji || '🍎'}
                onMotionDetect={handleAppleMotion}
              />
            </View>
            <Text style={[styles.heroTitle, { color: theme.textPrimary }]}>Food Lens</Text>
            <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>
              {t('home.hero.subtitle', 'Travel Safe, Eat Smart')}
            </Text>
          </View>

          <View style={styles.statsGrid}>
            <HapticTouchableOpacity
              activeOpacity={0.8}
              style={{ flex: 1 }}
              hapticType="light"
              onPress={handleOpenTripStats}
            >
              <BlurView
                intensity={80}
                tint={colorScheme === 'dark' ? 'dark' : 'light'}
                style={[styles.statCard, { backgroundColor: theme.glass }]}
                pointerEvents="none"
              >
                <View style={[styles.statIconBox, { backgroundColor: '#DCFCE7' }]}>
                  <ShieldCheck size={22} color="#166534" />
                </View>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                  {t('home.stats.safeItems', 'Safe Items')}
                </Text>
                <Text style={[styles.statValue, { color: theme.textPrimary }]}>{safeCount}</Text>
              </BlurView>
            </HapticTouchableOpacity>

            <HapticTouchableOpacity
              style={{ flex: 1 }}
              hapticType="light"
              onPress={handleOpenAllergies}
            >
              <BlurView
                intensity={80}
                tint={colorScheme === 'dark' ? 'dark' : 'light'}
                style={[styles.statCard, { backgroundColor: theme.glass }]}
                pointerEvents="none"
              >
                <View style={[styles.statIconBox, { backgroundColor: '#FFE4E6' }]}>
                  <Heart size={22} color="#E11D48" />
                </View>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                  {t('home.stats.allergies', 'Allergies')}
                </Text>
                <Text style={[styles.statValue, { color: theme.textPrimary }]}>{allergyCount}</Text>
              </BlurView>
            </HapticTouchableOpacity>
          </View>

          <View style={{ marginBottom: 8 }}>
            <WeeklyStatsStrip
              weeklyData={weeklyStats}
              selectedDate={selectedDate}
              onSelectDate={setSelectedDate}
            />
          </View>

          <HomeScansSection
            filteredScans={filteredScans}
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
          userId={CURRENT_USER_ID}
          onUpdate={loadDashboardData}
        />
      </SafeAreaView>

      <Animated.View
        style={[
          styles.orbContainer,
          {
            opacity: orbAnim,
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
