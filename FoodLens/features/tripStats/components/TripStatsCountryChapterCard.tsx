import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Globe } from 'lucide-react-native';

import { homeDashboardColors, homeDashboardRadii, homeDashboardSpacing, homeDashboardTypography } from '../../home/components/homeDashboardTokens';
import { homeDashboardStyles } from '../../home/components/homeDashboardStyles';
import PearlSurfaceOverlay from '../../home/components/PearlSurfaceOverlay';
import { useI18n } from '@/features/i18n';

export type TripStatsCountryChapterCardSignalTone = 'safe' | 'caution' | 'danger' | 'neutral';

export type TripStatsCountryChapterCardProps = Readonly<{
  chapterLabel: string;
  countryCode: string;
  countryName: string;
  summary: string;
  safeCount: number;
  totalCount: number;
  signalLabel: string;
  signalTone: TripStatsCountryChapterCardSignalTone;
  onPress?: () => void;
}>;

type SignalToneSpec = Readonly<{
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  iconBackgroundColor: string;
  iconColor: string;
}>;

const resolveSignalToneSpec = (tone: TripStatsCountryChapterCardSignalTone): SignalToneSpec => {
  if (tone === 'safe') {
    return {
      backgroundColor: homeDashboardColors.accentGreenSoft,
      borderColor: 'rgba(31, 107, 79, 0.16)',
      textColor: homeDashboardColors.accentGreen,
      iconBackgroundColor: 'rgba(31, 107, 79, 0.12)',
      iconColor: homeDashboardColors.accentGreen,
    };
  }

  if (tone === 'danger') {
    return {
      backgroundColor: homeDashboardColors.accentRedSoft,
      borderColor: 'rgba(185, 70, 62, 0.16)',
      textColor: homeDashboardColors.accentRed,
      iconBackgroundColor: 'rgba(185, 70, 62, 0.12)',
      iconColor: homeDashboardColors.accentRed,
    };
  }

  if (tone === 'neutral') {
    return {
      backgroundColor: homeDashboardColors.surfaceMuted,
      borderColor: homeDashboardColors.line,
      textColor: homeDashboardColors.inkSoft,
      iconBackgroundColor: homeDashboardColors.paperStrong,
      iconColor: homeDashboardColors.accentBlue,
    };
  }

  return {
    backgroundColor: homeDashboardColors.accentAmberSoft,
    borderColor: 'rgba(170, 106, 19, 0.16)',
    textColor: homeDashboardColors.accentAmber,
    iconBackgroundColor: 'rgba(170, 106, 19, 0.12)',
    iconColor: homeDashboardColors.accentAmber,
  };
};

const resolveBadgeTone = (
  safeCount: number,
  totalCount: number,
  signalTone: TripStatsCountryChapterCardSignalTone,
): TripStatsCountryChapterCardSignalTone => {
  if (signalTone !== 'neutral') {
    return signalTone;
  }

  if (totalCount === 0) {
    return 'neutral';
  }

  const safeRatio = safeCount / totalCount;

  if (safeRatio >= 0.75) {
    return 'safe';
  }

  if (safeRatio <= 0.35) {
    return 'danger';
  }

  return 'caution';
};

const getDisplayCountryCode = (countryCode: string): string => {
  const normalized = countryCode.trim();

  if (normalized.length === 0) {
    return 'CH';
  }

  return normalized.slice(0, 2).toUpperCase();
};

export function TripStatsCountryChapterCard({
  chapterLabel,
  countryCode,
  countryName,
  summary,
  safeCount,
  totalCount,
  signalLabel,
  signalTone,
  onPress,
}: TripStatsCountryChapterCardProps): React.JSX.Element {
  const { t } = useI18n();
  const resolvedTone = resolveBadgeTone(safeCount, totalCount, signalTone);
  const palette = resolveSignalToneSpec(resolvedTone);
  const displayCountryCode = getDisplayCountryCode(countryCode);
  const isInteractive = typeof onPress === 'function';

  return (
    <Pressable
      accessibilityRole={isInteractive ? 'button' : undefined}
      disabled={!isInteractive}
      onPress={onPress}
      style={({ pressed }) => [
        localStyles.card,
        {
          backgroundColor: homeDashboardColors.surfaceStrong,
          borderColor: palette.borderColor,
        },
        pressed && isInteractive ? localStyles.cardPressed : null,
      ]}
    >
      <PearlSurfaceOverlay
        accentWashColor={homeDashboardColors.pearlMist}
        baseBottomColor="#FFF8F0"
        baseTopColor={homeDashboardColors.pearlIvory}
        coolWashColor={homeDashboardColors.pearlSage}
        warmWashColor={homeDashboardColors.pearlPeach}
      />

      <View style={localStyles.content}>
        <View style={localStyles.headerRow}>
          <View style={localStyles.identityRow}>
            <View style={[localStyles.countryChip, { backgroundColor: palette.iconBackgroundColor }]}>
              <Globe color={palette.iconColor} size={16} strokeWidth={2.1} />
              <Text style={[localStyles.countryCode, { color: palette.textColor }]}>
                {displayCountryCode}
              </Text>
            </View>

            <View style={localStyles.headingCopy}>
              <Text style={localStyles.chapterLabel}>{chapterLabel}</Text>
              <Text numberOfLines={1} style={localStyles.countryName}>
                {countryName}
              </Text>
            </View>
          </View>

          <View style={[homeDashboardStyles.pill, localStyles.signalPill, { backgroundColor: palette.backgroundColor, borderColor: palette.borderColor }]}>
            <Text style={[homeDashboardStyles.pillText, localStyles.signalPillText, { color: palette.textColor }]}>
              {signalLabel}
            </Text>
          </View>
        </View>

        <Text numberOfLines={2} style={localStyles.summary}>
          {summary}
        </Text>

        <View style={localStyles.metricRow}>
          <View style={localStyles.metricBlock}>
            <Text style={localStyles.metricValue}>{String(safeCount)}</Text>
            <Text style={localStyles.metricLabel}>
              {t('tripStats.chapters.safeLabel', 'Safe scans')}
            </Text>
          </View>

          <View style={localStyles.metricDivider} />

          <View style={localStyles.metricBlock}>
            <Text style={localStyles.metricValue}>{String(totalCount)}</Text>
            <Text style={localStyles.metricLabel}>
              {t('tripStats.chapters.totalLabel', 'Total scans')}
            </Text>
          </View>

          <View style={localStyles.metricDivider} />

          <View style={localStyles.metricBlockExpanded}>
            <Text style={localStyles.metricLabel}>
              {t('tripStats.chapters.noteLabel', 'Chapter note')}
            </Text>
            <Text numberOfLines={1} style={localStyles.metricNote}>
              {countryName}
            </Text>
          </View>
        </View>

        {isInteractive ? (
          <View style={localStyles.footerRow}>
            <Text style={localStyles.footerText}>
              {t('tripStats.chapters.openLabel', 'Open chapter')}
            </Text>
            <ChevronRight color={homeDashboardColors.inkSoft} size={18} strokeWidth={2.2} />
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}

export default TripStatsCountryChapterCard;

const localStyles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    position: 'relative',
    borderRadius: homeDashboardRadii.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    padding: homeDashboardSpacing.md,
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.987 }],
  },
  content: {
    gap: homeDashboardSpacing.sm,
    zIndex: 1,
  },
  headerRow: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: homeDashboardSpacing.sm,
  },
  identityRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: homeDashboardSpacing.sm,
    minWidth: 0,
  },
  countryChip: {
    alignItems: 'center',
    borderRadius: homeDashboardRadii.lg,
    borderCurve: 'continuous',
    flexDirection: 'row',
    gap: homeDashboardSpacing.xxs,
    justifyContent: 'center',
    minHeight: 42,
    minWidth: 62,
    paddingHorizontal: homeDashboardSpacing.sm,
  },
  countryCode: {
    fontSize: homeDashboardTypography.caption,
    fontWeight: '800',
    letterSpacing: 0.8,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  headingCopy: {
    flex: 1,
    gap: homeDashboardSpacing.xxs,
    minWidth: 0,
  },
  chapterLabel: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '700',
    letterSpacing: 0.8,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  countryName: {
    color: homeDashboardColors.ink,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 28,
  },
  signalPill: {
    minHeight: 30,
    paddingHorizontal: homeDashboardSpacing.sm,
  },
  signalPillText: {
    letterSpacing: 0.5,
  },
  summary: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.body,
    fontWeight: '600',
    lineHeight: 20,
  },
  metricRow: {
    alignItems: 'stretch',
    flexDirection: 'row',
    gap: homeDashboardSpacing.sm,
  },
  metricBlock: {
    minWidth: 70,
    gap: 2,
  },
  metricBlockExpanded: {
    flex: 1,
    gap: 2,
    minWidth: 0,
  },
  metricValue: {
    color: homeDashboardColors.ink,
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.8,
    lineHeight: 26,
  },
  metricLabel: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.micro,
    fontWeight: '700',
    letterSpacing: 0.7,
    lineHeight: 14,
    textTransform: 'uppercase',
  },
  metricNote: {
    color: homeDashboardColors.accentBlue,
    fontSize: homeDashboardTypography.bodyStrong,
    fontWeight: '700',
    lineHeight: 18,
  },
  metricDivider: {
    alignSelf: 'stretch',
    width: 1,
    backgroundColor: homeDashboardColors.line,
  },
  footerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerText: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '700',
    letterSpacing: 0.4,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
});
