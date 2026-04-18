import React from 'react';
import { ArrowRight, Clock3 } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';

import { FoodThumbnail } from '@/components/FoodThumbnail';
import { HapticTouchableOpacity } from '@/components/HapticFeedback';
import type { AnalysisRecord } from '@/services/analysisService';
import { getBarcodeImageUri, resolveImageUri } from '@/services/imageStorage';
import { formatDate, getEmoji } from '@/services/utils';

import { homeDashboardStyles } from './homeDashboardStyles';
import PearlSurfaceOverlay from './PearlSurfaceOverlay';
import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardShadows,
  homeDashboardSpacing,
  homeDashboardTypography,
} from './homeDashboardTokens';
import { getHomeScanStatusBadge } from '../utils/homeUi';
import { getLocalizedFoodName } from '../utils/localizedFoodName';

type TranslationFunction = (key: string, fallback?: string) => string;

type HomeFeaturedScanProps = {
  item: AnalysisRecord | null;
  locale: string;
  t: TranslationFunction;
  onOpenResult: (item: AnalysisRecord) => void;
};

const getFeaturedSignalColors = (
  status: AnalysisRecord['safetyStatus']
): {
  glow: string;
  accent: string;
  backgroundTop: string;
  backgroundBottom: string;
  haze: string;
} => {
  if (status === 'SAFE') {
    return {
      glow: 'rgba(31, 107, 79, 0.16)',
      accent: homeDashboardColors.accentGreen,
      backgroundTop: '#F4F0E7',
      backgroundBottom: '#D7CCBA',
      haze: 'rgba(214, 229, 217, 0.52)',
    };
  }

  if (status === 'DANGER') {
    return {
      glow: 'rgba(185, 70, 62, 0.18)',
      accent: homeDashboardColors.accentRed,
      backgroundTop: '#F7EEE8',
      backgroundBottom: '#E0C9BB',
      haze: 'rgba(242, 222, 215, 0.5)',
    };
  }

  return {
    glow: 'rgba(170, 106, 19, 0.18)',
    accent: homeDashboardColors.accentAmber,
    backgroundTop: '#F6F0E5',
    backgroundBottom: '#DBCCB2',
    haze: 'rgba(239, 228, 198, 0.48)',
  };
};

export const HomeFeaturedScan = ({
  item,
  locale,
  t,
  onOpenResult,
}: HomeFeaturedScanProps): React.JSX.Element | null => {
  if (!item) {
    return null;
  }

  const localizedFoodName = getLocalizedFoodName(item, locale);
  const badge = getHomeScanStatusBadge(item.safetyStatus, t);
  const imageUri = item.isBarcode ? getBarcodeImageUri() : (resolveImageUri(item.imageUri) || undefined);
  const signalColors = getFeaturedSignalColors(item.safetyStatus);

  return (
    <HapticTouchableOpacity
      activeOpacity={0.92}
      hapticType="selection"
      onPress={() => onOpenResult(item)}
      style={styles.card}
    >
      <View
        style={[
          styles.media,
          {
            shadowColor: signalColors.accent,
          },
        ]}
      >
        <PearlSurfaceOverlay
          accentWashColor={signalColors.haze}
          baseBottomColor={signalColors.backgroundBottom}
          baseTopColor={signalColors.backgroundTop}
          coolWashColor={homeDashboardColors.pearlGlow}
          warmWashColor={signalColors.glow}
        />

        <View style={styles.ticket}>
          <View style={styles.eyebrowRow}>
            <View style={[styles.noteChip, styles.latestChip]}>
              <Text style={[styles.noteChipText, styles.latestChipText]}>
                {t('home.scans.featuredTitle', 'Latest Verdict')}
              </Text>
            </View>
            <View style={[styles.statusChip, { backgroundColor: badge.backgroundColor }]}>
              <Text style={[styles.statusChipText, { color: badge.textColor }]}>{badge.label}</Text>
            </View>
          </View>

          <View style={styles.thumbnailWrap}>
            <FoodThumbnail
              uri={imageUri}
              emoji={getEmoji(localizedFoodName)}
              style={styles.thumbnail}
              imageStyle={styles.thumbnailImage}
              fallbackFontSize={42}
            />
          </View>

          <View style={styles.bodyRow}>
            <View style={styles.copyBlock}>
              <Text style={styles.title} numberOfLines={2}>
                {localizedFoodName}
              </Text>
              <View style={styles.metaRow}>
                <Clock3 color={homeDashboardColors.inkSoft} size={14} strokeWidth={2.1} />
                <Text style={styles.metaText}>{formatDate(item.timestamp, locale)}</Text>
              </View>
            </View>

            <View pointerEvents="none" style={styles.actionButton}>
              <ArrowRight color={homeDashboardColors.ink} size={20} strokeWidth={2.2} />
            </View>
          </View>

          <View style={styles.noteChip}>
            <Text style={styles.noteChipText}>
              {t('home.scans.featuredHint', 'Open full analysis')}
            </Text>
          </View>
        </View>
      </View>
    </HapticTouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    ...homeDashboardStyles.elevatedCard,
    padding: homeDashboardSpacing.md,
    gap: homeDashboardSpacing.sm,
    backgroundColor: 'rgba(255, 251, 244, 0.98)',
  },
  media: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 212,
    borderRadius: 26,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.lineStrong,
    padding: homeDashboardSpacing.md,
  },
  ticket: {
    flex: 1,
    gap: homeDashboardSpacing.sm,
  },
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: homeDashboardSpacing.sm,
  },
  latestChip: {
    backgroundColor: 'rgba(255, 249, 239, 0.84)',
  },
  latestChipText: {
    color: homeDashboardColors.inkSoft,
  },
  statusChip: {
    minHeight: 30,
    paddingHorizontal: homeDashboardSpacing.sm,
    borderRadius: homeDashboardRadii.pill,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusChipText: {
    fontSize: homeDashboardTypography.micro,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
  thumbnailWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: homeDashboardSpacing.xs,
  },
  thumbnail: {
    width: 124,
    height: 124,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 250, 243, 0.84)',
  },
  thumbnailImage: {
    borderRadius: 28,
  },
  bodyRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: homeDashboardSpacing.sm,
  },
  copyBlock: {
    flex: 1,
    gap: homeDashboardSpacing.xs,
  },
  title: {
    color: homeDashboardColors.ink,
    fontSize: 30,
    lineHeight: 31,
    fontWeight: '700',
    letterSpacing: -0.8,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: homeDashboardSpacing.xs,
  },
  metaText: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.body,
    lineHeight: 20,
    fontWeight: '600',
  },
  actionButton: {
    width: 54,
    height: 54,
    borderRadius: homeDashboardRadii.sm,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    backgroundColor: 'rgba(255, 251, 245, 0.86)',
    boxShadow: homeDashboardShadows.card,
  },
  noteChip: {
    alignSelf: 'flex-start',
    minHeight: 28,
    paddingHorizontal: 10,
    borderRadius: homeDashboardRadii.pill,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(23, 32, 51, 0.18)',
    backgroundColor: 'rgba(255, 251, 245, 0.76)',
    justifyContent: 'center',
  },
  noteChipText: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.micro,
    lineHeight: 16,
    fontWeight: '800',
    letterSpacing: 0.88,
    textTransform: 'uppercase',
  },
});

export default HomeFeaturedScan;
