import React from 'react';
import { Image, Text, TouchableOpacity, View, FlatList, useWindowDimensions } from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { Translate, BadgeAnimatedStyle } from '../../types/onboarding.types';
import { onboardingStyles as styles } from '../../styles/onboarding.styles';

type Props = {
  theme: any;
  t: Translate;
  badgeRightStyle: BadgeAnimatedStyle;
  badgeLeftStyle: BadgeAnimatedStyle;
  onStart: () => void;
};

export default function WelcomeStep({ theme, t, badgeRightStyle, badgeLeftStyle, onStart }: Props) {
  const [carouselIndex, setCarouselIndex] = React.useState(0);
  const { width: screenWidth } = useWindowDimensions();
  const slideWidth = screenWidth - 48; // paddingHorizontal: 24 * 2
  const totalSlides = 4;
  const slides = React.useMemo(() => [0, 1, 2, 3], []);

  const viewabilityConfig = React.useRef({ itemVisiblePercentThreshold: 60 });
  const onViewableItemsChanged = React.useRef(
    ({ viewableItems }: { viewableItems: Array<{ index: number | null }> }) => {
      const currentIndex = viewableItems[0]?.index ?? 0;
      setCarouselIndex(Math.max(0, Math.min(totalSlides - 1, currentIndex)));
    }
  );

  const getItemLayout = React.useCallback(
    (_: ArrayLike<number> | null | undefined, index: number) => ({
      length: slideWidth,
      offset: slideWidth * index,
      index,
    }),
    [slideWidth]
  );

  const renderSlide = React.useCallback(
    (slideIndex: number) => {
      if (slideIndex === 0) {
        return (
          <View style={[styles.bentoGrid, { width: slideWidth }]}>
            <View
              style={[styles.bentoCardFull, { backgroundColor: theme.surface, borderColor: theme.border }]}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <View style={[styles.bentoIconCircle, { backgroundColor: 'rgba(60,131,246,0.15)' }]}>
                <Ionicons name="barcode-outline" size={24} color={theme.primary} />
              </View>
              <View>
                <Text style={[styles.bentoCardTitle, { color: theme.textPrimary }]}>
                  {t('onboarding.welcome.feature1', 'Scan labels')}
                </Text>
                <Text style={[styles.bentoCardSub, { color: theme.textSecondary }]}>
                  {t('onboarding.welcome.feature1sub', 'Instantly read ingredients')}
                </Text>
              </View>
            </View>

            <View style={styles.bentoHalfRow}>
              <View style={[styles.bentoCardHalf, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.bentoIconCircle, { backgroundColor: 'rgba(245,158,11,0.15)' }]}>
                  <Ionicons name="flash" size={20} color="#f59e0b" />
                </View>
                <Text style={[styles.bentoCardTitle, { color: theme.textPrimary, fontSize: 14, marginTop: 8 }]}>
                  {t('onboarding.welcome.feature2', 'Detect instantly')}
                </Text>
              </View>
              <View style={[styles.bentoCardHalf, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.bentoIconCircle, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
                  <Ionicons name="globe-outline" size={20} color="#10b981" />
                </View>
                <Text style={[styles.bentoCardTitle, { color: theme.textPrimary, fontSize: 14, marginTop: 8 }]}>
                  {t('onboarding.welcome.feature3', 'Global support')}
                </Text>
              </View>
            </View>
          </View>
        );
      }

      if (slideIndex === 1) {
        return (
          <View style={[styles.bentoGrid, { width: slideWidth }]}>
            <View style={[styles.bentoCardFull, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.bentoIconCircle, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                <Ionicons name="shield-checkmark-outline" size={24} color="#ef4444" />
              </View>
              <View>
                <Text style={[styles.bentoCardTitle, { color: theme.textPrimary }]}>
                  {t('onboarding.welcome.feature4', 'Safe Eating')}
                </Text>
                <Text style={[styles.bentoCardSub, { color: theme.textSecondary }]}>
                  {t('onboarding.welcome.feature4sub', 'Verified allergen database')}
                </Text>
              </View>
            </View>

            <View style={styles.bentoHalfRow}>
              <View style={[styles.bentoCardHalf, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.bentoIconCircle, { backgroundColor: 'rgba(168,85,247,0.15)' }]}>
                  <Ionicons name="person-outline" size={20} color="#a855f7" />
                </View>
                <Text style={[styles.bentoCardTitle, { color: theme.textPrimary, fontSize: 14, marginTop: 8 }]}>
                  {t('onboarding.welcome.feature5', 'Personalized')}
                </Text>
              </View>
              <View style={[styles.bentoCardHalf, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.bentoIconCircle, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                  <Ionicons name="time-outline" size={20} color="#3b82f6" />
                </View>
                <Text style={[styles.bentoCardTitle, { color: theme.textPrimary, fontSize: 14, marginTop: 8 }]}>
                  {t('onboarding.welcome.feature6', 'History Log')}
                </Text>
              </View>
            </View>
          </View>
        );
      }

      if (slideIndex === 2) {
        return (
          <View style={[styles.bentoGrid, { width: slideWidth }]}>
            <View
              style={[styles.bentoCardFull, { backgroundColor: theme.surface, borderColor: theme.border }]}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <View style={[styles.bentoIconCircle, { backgroundColor: 'rgba(168,85,247,0.15)' }]}>
                <Ionicons name="language-outline" size={24} color="#a855f7" />
              </View>
              <View>
                <Text style={[styles.bentoCardTitle, { color: theme.textPrimary }]}>
                  {t('onboarding.welcome.feature7', 'Travel Mode')}
                </Text>
                <Text style={[styles.bentoCardSub, { color: theme.textSecondary }]}>
                  {t('onboarding.welcome.feature7sub', 'Auto-translate allergies')}
                </Text>
              </View>
            </View>

            <View style={styles.bentoHalfRow}>
              <View style={[styles.bentoCardHalf, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.bentoIconCircle, { backgroundColor: 'rgba(234,179,8,0.15)' }]}>
                  <Ionicons name="restaurant-outline" size={20} color="#eab308" />
                </View>
                <Text style={[styles.bentoCardTitle, { color: theme.textPrimary, fontSize: 13, marginTop: 8 }]}>
                  {t('onboarding.welcome.feature8', 'Show to Chef')}
                </Text>
              </View>
              <View style={[styles.bentoCardHalf, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.bentoIconCircle, { backgroundColor: 'rgba(239,68,68,0.15)' }]}>
                  <Ionicons name="medkit-outline" size={20} color="#ef4444" />
                </View>
                <Text style={[styles.bentoCardTitle, { color: theme.textPrimary, fontSize: 13, marginTop: 8 }]}>
                  {t('onboarding.welcome.feature9', 'Emergency Info')}
                </Text>
              </View>
            </View>
          </View>
        );
      }

      return (
        <View style={[styles.bentoGrid, { width: slideWidth }]}>
          <View
            style={[styles.bentoCardFull, { backgroundColor: theme.surface, borderColor: theme.border }]}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <View style={[styles.bentoIconCircle, { backgroundColor: 'rgba(16,185,129,0.15)' }]}>
              <Ionicons name="shield-checkmark-outline" size={24} color="#10b981" />
            </View>
            <View>
              <Text style={[styles.bentoCardTitle, { color: theme.textPrimary }]}>
                {t('onboarding.welcome.feature10', 'Trusted Data')}
              </Text>
              <Text style={[styles.bentoCardSub, { color: theme.textSecondary }]}>
                {t('onboarding.welcome.feature10sub', 'USDA & FDA verified')}
              </Text>
            </View>
          </View>

          <View style={styles.bentoHalfRow}>
            <View style={[styles.bentoCardHalf, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.bentoIconCircle, { backgroundColor: 'rgba(59,130,246,0.15)' }]}>
                <Ionicons name="lock-closed-outline" size={20} color="#3b82f6" />
              </View>
              <Text style={[styles.bentoCardTitle, { color: theme.textPrimary, fontSize: 13, marginTop: 8 }]}>
                {t('onboarding.welcome.feature11', 'Privacy First')}
              </Text>
            </View>
            <View style={[styles.bentoCardHalf, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[styles.bentoIconCircle, { backgroundColor: 'rgba(99,102,241,0.15)' }]}>
                <Ionicons name="cloud-done-outline" size={20} color="#6366f1" />
              </View>
              <Text style={[styles.bentoCardTitle, { color: theme.textPrimary, fontSize: 13, marginTop: 8 }]}>
                {t('onboarding.welcome.feature12', 'Secure Cloud')}
              </Text>
            </View>
          </View>
        </View>
      );
    },
    [slideWidth, t, theme]
  );

  return (
    <View style={styles.stepContainer}>
      <View style={[styles.heroArea, { paddingTop: 8 }]}>
        <View style={styles.heroImageWrapper}>
          <View style={[styles.heroImagePlaceholder, { backgroundColor: 'transparent' }]}>
            <Image
              source={require('@/assets/images/onboarding_hero.png')}
              style={{ width: '100%', height: '100%', borderRadius: 24, marginTop: 40 }}
              resizeMode="cover"
            />
          </View>
          <Animated.View
            style={[
              styles.floatingBadge,
              styles.floatingBadgeRight,
              { backgroundColor: 'rgba(30,41,59,0.8)', borderColor: theme.border },
              badgeRightStyle,
            ]}
          >
            <Ionicons name="checkmark-circle" size={28} color="#4ade80" />
          </Animated.View>
          <Animated.View
            style={[
              styles.floatingBadge,
              styles.floatingBadgeLeft,
              { backgroundColor: 'rgba(30,41,59,0.8)', borderColor: theme.border },
              badgeLeftStyle,
            ]}
          >
            <Ionicons name="warning" size={28} color="#fb923c" />
          </Animated.View>
        </View>
      </View>

      <Text style={[styles.welcomeTitle, { color: theme.textPrimary }]}>FoodLens</Text>
      <Text style={[styles.welcomeSubtitle, { color: theme.textSecondary }]}>
        {t('onboarding.welcome.subtitle', 'Eat safely, anywhere in the world')}
      </Text>

      <View style={{ height: 240, overflow: 'hidden' }}>
      <View style={{ height: 240, overflow: 'hidden', marginHorizontal: -24 }}>
        <FlatList
          horizontal
          pagingEnabled
          snapToInterval={screenWidth}
          decelerationRate="fast"
          disableIntervalMomentum
          data={slides}
          keyExtractor={(item) => String(item)}
          renderItem={({ item }) => (
            <View style={{ width: screenWidth, alignItems: 'center' }}>
              {renderSlide(item)}
            </View>
          )}
          getItemLayout={getItemLayout}
          onViewableItemsChanged={onViewableItemsChanged.current}
          viewabilityConfig={viewabilityConfig.current}
          showsHorizontalScrollIndicator={false}
          initialNumToRender={1}
          windowSize={3}
          removeClippedSubviews={false}
          extraData={screenWidth}
        />
      </View>
      </View>

      {/* Carousel Pagination (4 pages) */}
      <View style={styles.paginationContainer}>
        {Array.from({ length: totalSlides }, (_, idx) => (
            <View
                key={idx}
                style={[
                    styles.paginationDot,
                    {
                        backgroundColor: carouselIndex === idx ? theme.primary : theme.border,
                        width: carouselIndex === idx ? 32 : 8,
                    },
                ]}
            />
        ))}
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: theme.primary }]}
        onPress={onStart}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.welcome.start', 'Get Started')}
        accessibilityHint={t('onboarding.accessibility.welcomeStartHint', 'Move to the next onboarding step')}
      >
        <Text style={styles.primaryButtonText}>{t('onboarding.welcome.start', 'Get Started')}</Text>
        <Ionicons name="arrow-forward" size={20} color="white" style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    </View>
  );
}
