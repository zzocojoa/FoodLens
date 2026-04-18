import React from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChevronRight, Trash2 } from 'lucide-react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { FoodThumbnail } from '@/components/FoodThumbnail';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import type { AnalysisRecord } from '@/services/analysisService';
import { getBarcodeImageUri, resolveImageUri } from '@/services/imageStorage';
import { formatDate, getEmoji } from '@/services/utils';

import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardSpacing,
  homeDashboardTypography,
} from './homeDashboardTokens';
import { getHomeScanStatusBadge } from '../utils/homeUi';
import { getLocalizedFoodName } from '../utils/localizedFoodName';

type TranslationFunction = (key: string, fallback?: string) => string;

type HomeRecentFeedItemProps = {
  item: AnalysisRecord;
  locale: string;
  t: TranslationFunction;
  onOpenResult: (item: AnalysisRecord) => void;
  onDeleteItem: (itemId: string) => void;
};

const getThumbTone = (
  status: AnalysisRecord['safetyStatus']
): {
  backgroundColor: string;
  borderColor: string;
} => {
  if (status === 'SAFE') {
    return {
      backgroundColor: 'rgba(31, 107, 79, 0.10)',
      borderColor: 'rgba(31, 107, 79, 0.12)',
    };
  }

  if (status === 'DANGER') {
    return {
      backgroundColor: 'rgba(185, 70, 62, 0.12)',
      borderColor: 'rgba(185, 70, 62, 0.14)',
    };
  }

  return {
    backgroundColor: 'rgba(170, 106, 19, 0.12)',
    borderColor: 'rgba(170, 106, 19, 0.14)',
  };
};

export const HomeRecentFeedItem = ({
  item,
  locale,
  t,
  onOpenResult,
  onDeleteItem,
}: HomeRecentFeedItemProps): React.JSX.Element => {
  const badge = getHomeScanStatusBadge(item.safetyStatus, t);
  const localizedFoodName = getLocalizedFoodName(item, locale);
  const imageUri = item.isBarcode ? getBarcodeImageUri() : (resolveImageUri(item.imageUri) || undefined);
  const thumbTone = getThumbTone(item.safetyStatus);

  const renderRightActions = (
    progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ): React.JSX.Element => {
    const translateX = dragX.interpolate({
      inputRange: [-88, 0],
      outputRange: [0, 88],
      extrapolate: 'clamp',
    });

    const opacity = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0.68, 1],
      extrapolate: 'clamp',
    });

    return (
      <TouchableOpacity onPress={() => onDeleteItem(item.id)} style={styles.deleteAction}>
        <Animated.View
          pointerEvents="none"
          style={[
            styles.deleteActionContent,
            {
              opacity,
              transform: [{ translateX }],
            },
          ]}
        >
          <Trash2 color={homeDashboardColors.white} size={18} strokeWidth={2.2} />
          <Text style={styles.deleteLabel}>{t('common.delete', 'Delete')}</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  return (
    <Swipeable
      overshootRight={false}
      renderRightActions={renderRightActions}
    >
      <HapticTouchableOpacity
        activeOpacity={0.82}
        hapticType="light"
        onPress={() => onOpenResult(item)}
        style={styles.card}
      >
        <View style={[styles.thumbWrap, thumbTone]}>
          <FoodThumbnail
            uri={imageUri}
            emoji={getEmoji(localizedFoodName)}
            style={styles.thumb}
            imageStyle={styles.thumbImage}
            fallbackFontSize={22}
          />
        </View>

        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.name}>
            {localizedFoodName}
          </Text>
          <Text numberOfLines={1} style={styles.meta}>
            {formatDate(item.timestamp, locale)}
          </Text>
        </View>

        <View style={styles.trailing}>
          <View style={[styles.badge, { backgroundColor: badge.backgroundColor }]}>
            <Text style={[styles.badgeText, { color: badge.textColor }]}>{badge.label}</Text>
          </View>
          <ChevronRight color={homeDashboardColors.inkSoft} size={18} strokeWidth={2.2} />
        </View>
      </HapticTouchableOpacity>
    </Swipeable>
  );
};

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: homeDashboardSpacing.sm,
    padding: homeDashboardSpacing.sm,
    borderRadius: 20,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    backgroundColor: 'rgba(255, 252, 247, 0.9)',
  },
  thumbWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    borderCurve: 'continuous',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: 'rgba(255, 250, 240, 0.94)',
  },
  thumbImage: {
    borderRadius: 15,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  name: {
    color: homeDashboardColors.ink,
    fontSize: homeDashboardTypography.bodyStrong,
    lineHeight: 20,
    fontWeight: '700',
  },
  meta: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    lineHeight: 17,
    fontWeight: '600',
  },
  trailing: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: homeDashboardSpacing.xs,
  },
  badge: {
    minWidth: 76,
    minHeight: 30,
    paddingHorizontal: 10,
    borderRadius: homeDashboardRadii.pill,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: homeDashboardTypography.micro,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
  deleteAction: {
    width: 88,
    justifyContent: 'center',
    alignItems: 'stretch',
    marginLeft: homeDashboardSpacing.xs,
  },
  deleteActionContent: {
    flex: 1,
    borderRadius: homeDashboardRadii.sm,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    backgroundColor: homeDashboardColors.accentRed,
  },
  deleteLabel: {
    color: homeDashboardColors.white,
    fontSize: homeDashboardTypography.caption,
    lineHeight: 16,
    fontWeight: '700',
  },
});

export default HomeRecentFeedItem;
