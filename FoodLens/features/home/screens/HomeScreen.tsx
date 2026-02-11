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
import { Camera, Heart, ShieldCheck, Trash2 } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { useRouter } from 'expo-router';

import { Colors, THEME } from '../../../constants/theme';
import { useColorScheme } from '../../../hooks/use-color-scheme';
import { dataStore } from '../../../services/dataStore';
import { formatDate, getEmoji } from '../../../services/utils';
import { resolveImageUri } from '../../../services/imageStorage';
import { FoodThumbnail } from '../../../components/FoodThumbnail';
import { FloatingEmojis, FloatingEmojisHandle } from '../../../components/FloatingEmojis';
import { HapticTouchableOpacity } from '../../../components/HapticFeedback';
import ProfileSheet from '../../../components/ProfileSheet';
import SpatialApple from '../../../components/SpatialApple';
import { SecureImage } from '../../../components/SecureImage';
import { WeeklyStatsStrip } from '../../../components/WeeklyStatsStrip';
import { HapticsService } from '../../../services/haptics';
import { useNetworkStatus } from '../../../hooks/useNetworkStatus';
import { useHomeDashboard } from '../hooks/useHomeDashboard';
import { homeStyles as styles } from '../styles/homeStyles';
import { isSameDay } from '../utils/homeDashboard';

const getBadgeStyle = (status: string) => {
  switch (status) {
    case 'SAFE':
      return { container: styles.badgeSafe, text: { color: '#15803D' } };
    case 'DANGER':
      return { container: styles.badgeDanger, text: { color: '#BE123C' } };
    default:
      return { container: { backgroundColor: '#FEF3C7' }, text: { color: '#B45309' } };
  }
};

export default function HomeScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];
  const { isConnected } = useNetworkStatus();

  const floatingEmojisRef = React.useRef<FloatingEmojisHandle>(null);
  const orbAnim = React.useRef(new Animated.Value(1)).current;

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
  } = useHomeDashboard();

  const handleAppleMotion = React.useCallback(() => {
    floatingEmojisRef.current?.trigger();
  }, []);

  React.useEffect(() => {
    Animated.spring(orbAnim, {
      toValue: activeModal === 'PROFILE' ? 0 : 1,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  }, [activeModal, orbAnim]);

  const handleStartAnalysis = () => {
    HapticsService.tickTick();
    router.push('/scan/camera');
  };

  const renderRightActions = (dragX: any, onClick: () => void) => {
    const trans = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [0, 80],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity onPress={onClick} style={styles.deleteAction}>
        <Animated.View
          style={[styles.deleteBtnContent, { transform: [{ translateX: trans }] }]}
          pointerEvents="none"
        >
          <Trash2 size={24} color="white" />
          <Text style={styles.deleteText}>Delete</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.backgroundContainer} />

      <SafeAreaView style={{ flex: 1, backgroundColor: theme.background }} edges={['top']}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />

        {isConnected === false && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>Offline Mode: Using cached data</Text>
          </View>
        )}

        <View style={[styles.header, { paddingHorizontal: 24 }]}>
          <View style={styles.userInfo}>
            <Pressable
              onPress={() => {
                HapticsService.medium();
                setActiveModal('PROFILE');
              }}
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
              <Text style={[styles.welcomeText, { color: theme.textSecondary }]}>Welcome back,</Text>
              <Text style={[styles.userName, { color: theme.textPrimary }]}>
                {userProfile?.name || 'Traveler Joy'} ✈️
              </Text>
            </View>
          </View>

          <Pressable
            onPress={() => {
              HapticsService.light();
              router.push('/emoji-picker');
            }}
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
            <Text style={[styles.heroSubtitle, { color: theme.textSecondary }]}>Travel Safe, Eat Smart</Text>
          </View>

          <View style={styles.statsGrid}>
            <HapticTouchableOpacity
              activeOpacity={0.8}
              style={{ flex: 1 }}
              hapticType="light"
              onPress={() => router.push('/trip-stats')}
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
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Safe Items</Text>
                <Text style={[styles.statValue, { color: theme.textPrimary }]}>{safeCount}</Text>
              </BlurView>
            </HapticTouchableOpacity>

            <HapticTouchableOpacity
              style={{ flex: 1 }}
              hapticType="light"
              onPress={() => router.push('/allergies')}
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
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>Allergies</Text>
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

          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
              {isSameDay(selectedDate, new Date())
                ? 'Recent Scans'
                : `Scans on ${new Intl.DateTimeFormat('en-US', {
                    month: 'short',
                    day: 'numeric',
                  }).format(selectedDate)}`}
            </Text>
            <HapticTouchableOpacity onPress={() => router.push('/history')} hapticType="selection">
              <View pointerEvents="none">
                <Text style={[styles.seeAllText, { color: theme.primary }]}>See All</Text>
              </View>
            </HapticTouchableOpacity>
          </View>

          <View style={styles.scanList}>
            {filteredScans.length > 0 ? (
              filteredScans.map((item, index) => (
                <View key={`${item.id}-${index}`} style={{ marginBottom: 12 }}>
                  <Swipeable
                    renderRightActions={(_, dragX) =>
                      renderRightActions(dragX, () => handleDeleteItem(item.id))
                    }
                  >
                    <HapticTouchableOpacity
                      style={[
                        styles.scanItem,
                        { marginBottom: 0 },
                        {
                          backgroundColor: theme.glass,
                          borderColor: theme.glassBorder,
                        },
                      ]}
                      activeOpacity={0.7}
                      hapticType="light"
                      onPress={() => {
                        dataStore.setData(item, item.location, item.imageUri || '');
                        router.push({ pathname: '/result', params: { fromStore: 'true' } });
                      }}
                    >
                      <View style={styles.scanInfo}>
                        <View style={[styles.scanEmojiBox, { backgroundColor: theme.surface }]}>
                          <FoodThumbnail
                            uri={resolveImageUri(item.imageUri) || undefined}
                            emoji={getEmoji(item.foodName)}
                            style={{
                              width: '100%',
                              height: '100%',
                              borderRadius: 16,
                              backgroundColor: 'transparent',
                            }}
                            imageStyle={{ borderRadius: 12 }}
                            fallbackFontSize={24}
                          />
                        </View>
                        <View>
                          <Text style={[styles.scanName, { color: theme.textPrimary }]}>{item.foodName}</Text>
                          <Text style={[styles.scanDate, { color: theme.textSecondary }]}>
                            {formatDate(item.timestamp)}
                          </Text>
                        </View>
                      </View>

                      {(() => {
                        const badgeStyle = getBadgeStyle(item.safetyStatus);
                        let displayStatus = 'ASK';
                        if (item.safetyStatus === 'SAFE') displayStatus = 'OK';
                        if (item.safetyStatus === 'DANGER') displayStatus = 'AVOID';

                        return (
                          <View style={[styles.badge, badgeStyle.container]}>
                            <Text style={[styles.badgeText, badgeStyle.text]}>{displayStatus}</Text>
                          </View>
                        );
                      })()}
                    </HapticTouchableOpacity>
                  </Swipeable>
                </View>
              ))
            ) : (
              <View style={{ paddingVertical: 32, alignItems: 'center', opacity: 0.5 }}>
                <Text
                  style={{
                    textAlign: 'center',
                    color: theme.textSecondary,
                    fontSize: 16,
                    fontWeight: '500',
                  }}
                >
                  No records for this day
                </Text>
                <Text
                  style={{
                    textAlign: 'center',
                    color: theme.textSecondary,
                    fontSize: 12,
                    marginTop: 4,
                  }}
                >
                  Try analyzing a new meal!
                </Text>
              </View>
            )}
          </View>
        </ScrollView>

        <ProfileSheet
          isOpen={activeModal === 'PROFILE'}
          onClose={() => setActiveModal('NONE')}
          userId="test-user-v1"
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
