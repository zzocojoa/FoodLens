import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { homeDashboardStyles } from './homeDashboardStyles';
import PearlSurfaceOverlay from './PearlSurfaceOverlay';
import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardSignalColors,
  homeDashboardSpacing,
  homeDashboardTypography,
} from './homeDashboardTokens';
import type { HomeStatusSignal } from '../utils/homeStatusCard';

type HomeHeroVerdictProps = {
  t: (key: string, fallback?: string) => string;
  signalDateLabel: string;
  statusLabel: string;
  statusChipLabel: string;
  activeSignal: HomeStatusSignal | null;
  statusCounts: {
    safe: number;
    caution: number;
    danger: number;
  };
  onSignalPress: (signal: HomeStatusSignal) => void;
};

type SignalCardContent = {
  signal: HomeStatusSignal;
  label: string;
  count: number;
};

const getSignalCardStyle = (
  signal: HomeStatusSignal,
  isActive: boolean
): StyleProp<ViewStyle> => {
  const palette = homeDashboardSignalColors[signal];

  if (isActive) {
    return {
      backgroundColor: palette.background,
      borderColor: palette.text,
    };
  }

  return {
    backgroundColor: homeDashboardColors.surfaceMuted,
    borderColor: homeDashboardColors.line,
  };
};

const getSignalTextColor = (
  signal: HomeStatusSignal,
  isActive: boolean
): string => {
  if (isActive) {
    return homeDashboardSignalColors[signal].text;
  }

  return homeDashboardColors.ink;
};

const getSignalMetaColor = (
  signal: HomeStatusSignal,
  isActive: boolean
): string => {
  if (isActive) {
    return homeDashboardSignalColors[signal].text;
  }

  return homeDashboardColors.inkSoft;
};

const getSignalCards = (
  statusCounts: HomeHeroVerdictProps['statusCounts'],
  t: (key: string, fallback?: string) => string
): SignalCardContent[] => [
  {
    signal: 'SAFE',
    label: t('home.status.pill.safe', 'Safe'),
    count: statusCounts.safe,
  },
  {
    signal: 'CAUTION',
    label: t('home.status.pill.caution', 'Caution'),
    count: statusCounts.caution,
  },
  {
    signal: 'DANGER',
    label: t('home.status.pill.danger', 'Risk'),
    count: statusCounts.danger,
  },
];

export function HomeHeroVerdict({
  t,
  signalDateLabel,
  statusLabel,
  statusChipLabel,
  activeSignal,
  statusCounts,
  onSignalPress,
}: HomeHeroVerdictProps): React.JSX.Element {
  const signalCards = getSignalCards(statusCounts, t);

  return (
    <View style={[homeDashboardStyles.elevatedCard, styles.heroCard]}>
      <PearlSurfaceOverlay
        accentWashColor={homeDashboardColors.pearlMist}
        baseBottomColor="#FFF7EF"
        baseTopColor={homeDashboardColors.pearlIvory}
        coolWashColor={homeDashboardColors.pearlSage}
        warmWashColor={homeDashboardColors.pearlPeach}
      />
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <View style={styles.copyBlock}>
            <Text style={styles.eyebrow}>{signalDateLabel}</Text>
            <Text style={styles.kicker}>
              {t('home.hero.kicker', "Today's food signal")}
            </Text>
            <Text style={styles.verdict}>{statusLabel}</Text>
          </View>
          <View style={[homeDashboardStyles.pill, styles.heroPill]}>
            <Text style={[homeDashboardStyles.pillText, styles.heroPillText]}>
              {statusChipLabel}
            </Text>
          </View>
        </View>

        <Text numberOfLines={2} style={styles.bodyCopy}>
          {t(
            'home.hero.summary',
            "Scan signals are grouped by today's safety readout. Tap a lane to focus the feed.",
          )}
        </Text>

        <View style={styles.signalGrid}>
          {signalCards.map((card) => {
            const isActive = activeSignal === card.signal;
            const valueColor = getSignalTextColor(card.signal, isActive);
            const metaColor = getSignalMetaColor(card.signal, isActive);

            return (
              <Pressable
                key={card.signal}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                onPress={() => onSignalPress(card.signal)}
                style={({ pressed }) => [
                  styles.signalCard,
                  getSignalCardStyle(card.signal, isActive),
                  pressed ? styles.signalCardPressed : null,
                ]}
              >
                <Text style={[styles.signalCount, { color: valueColor }]}>
                  {card.count}
                </Text>
                <Text style={[styles.signalLabel, { color: valueColor }]}>
                  {card.label}
                </Text>
                <Text style={[styles.signalMeta, { color: metaColor }]}>
                  {isActive
                    ? t('home.hero.filterFocused', 'Focused lane')
                    : t('home.hero.filterAvailable', 'Open lane')}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

export default HomeHeroVerdict;

const styles = StyleSheet.create({
  heroCard: {
    gap: homeDashboardSpacing.md,
    overflow: 'hidden',
    position: 'relative',
  },
  content: {
    gap: homeDashboardSpacing.md,
    zIndex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: homeDashboardSpacing.md,
  },
  copyBlock: {
    flex: 1,
    gap: homeDashboardSpacing.xs,
    minWidth: 0,
  },
  eyebrow: {
    fontSize: homeDashboardTypography.caption,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
    color: homeDashboardColors.inkSoft,
  },
  kicker: {
    fontSize: homeDashboardTypography.body,
    lineHeight: 20,
    fontWeight: '600',
    color: homeDashboardColors.inkSoft,
  },
  verdict: {
    fontSize: 48,
    lineHeight: 50,
    fontWeight: '800',
    letterSpacing: -1.8,
    textTransform: 'uppercase',
    color: homeDashboardColors.ink,
  },
  heroPill: {
    alignSelf: 'flex-start',
    minWidth: 92,
    backgroundColor: 'rgba(255, 246, 231, 0.88)',
  },
  heroPillText: {
    color: homeDashboardColors.ink,
  },
  bodyCopy: {
    fontSize: homeDashboardTypography.body,
    lineHeight: 20,
    color: homeDashboardColors.inkSoft,
  },
  signalGrid: {
    flexDirection: 'row',
    gap: homeDashboardSpacing.xs,
  },
  signalCard: {
    flex: 1,
    minHeight: 104,
    borderRadius: homeDashboardRadii.md,
    borderCurve: 'continuous',
    borderWidth: 1,
    paddingHorizontal: homeDashboardSpacing.sm,
    paddingVertical: homeDashboardSpacing.sm,
    justifyContent: 'space-between',
    gap: homeDashboardSpacing.xs,
  },
  signalCardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  signalCount: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  signalLabel: {
    fontSize: homeDashboardTypography.body,
    lineHeight: 18,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  signalMeta: {
    fontSize: homeDashboardTypography.micro,
    lineHeight: 14,
    fontWeight: '600',
  },
});
