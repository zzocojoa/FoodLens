import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import {
  BadgeCheck,
  CirclePlus,
  Loader2,
  ShieldAlert,
  Sparkles,
} from 'lucide-react-native';

import PearlSurfaceOverlay from '../../home/components/PearlSurfaceOverlay';
import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardSpacing,
  homeDashboardTypography,
} from '../../home/components/homeDashboardTokens';
import type {
  AllergiesPassportCardCopy,
  AllergiesPassportHeroState,
} from './AllergiesPassportHero';

type AllergiesTravelerPassportCardTone = {
  accentColor: string;
  badgeBackgroundColor: string;
  badgeTextColor: string;
  bodyColor: string;
  headlineColor: string;
  overlayAccentColor: string;
  overlayBaseBottomColor: string;
  overlayBaseTopColor: string;
  overlayCoolColor: string;
  overlayWarmColor: string;
  supportingColor: string;
};

export type AllergiesTravelerPassportCardProps = {
  state: AllergiesPassportHeroState;
  copy: AllergiesPassportCardCopy;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const getCardTone = (state: AllergiesPassportHeroState): AllergiesTravelerPassportCardTone => {
  if (state === 'loading') {
    return {
      accentColor: homeDashboardColors.inkSoft,
      badgeBackgroundColor: homeDashboardColors.surfaceMuted,
      badgeTextColor: homeDashboardColors.inkSoft,
      bodyColor: homeDashboardColors.inkSoft,
      headlineColor: homeDashboardColors.ink,
      overlayAccentColor: homeDashboardColors.pearlMist,
      overlayBaseBottomColor: homeDashboardColors.paperStrong,
      overlayBaseTopColor: homeDashboardColors.pearlIvory,
      overlayCoolColor: homeDashboardColors.pearlGlow,
      overlayWarmColor: homeDashboardColors.pearlMist,
      supportingColor: homeDashboardColors.inkSoft,
    };
  }

  if (state === 'empty') {
    return {
      accentColor: homeDashboardColors.accentAmber,
      badgeBackgroundColor: homeDashboardColors.accentAmberSoft,
      badgeTextColor: homeDashboardColors.accentAmber,
      bodyColor: homeDashboardColors.inkSoft,
      headlineColor: homeDashboardColors.ink,
      overlayAccentColor: homeDashboardColors.pearlPeach,
      overlayBaseBottomColor: homeDashboardColors.paper,
      overlayBaseTopColor: homeDashboardColors.pearlIvory,
      overlayCoolColor: homeDashboardColors.pearlGlow,
      overlayWarmColor: homeDashboardColors.pearlPeach,
      supportingColor: homeDashboardColors.inkSoft,
    };
  }

  if (state === 'personalized') {
    return {
      accentColor: homeDashboardColors.accentGreen,
      badgeBackgroundColor: homeDashboardColors.accentGreenSoft,
      badgeTextColor: homeDashboardColors.accentGreen,
      bodyColor: homeDashboardColors.inkSoft,
      headlineColor: homeDashboardColors.ink,
      overlayAccentColor: homeDashboardColors.pearlSage,
      overlayBaseBottomColor: homeDashboardColors.paperStrong,
      overlayBaseTopColor: homeDashboardColors.pearlIvory,
      overlayCoolColor: homeDashboardColors.pearlSage,
      overlayWarmColor: homeDashboardColors.pearlGlow,
      supportingColor: homeDashboardColors.inkSoft,
    };
  }

  if (state === 'generic') {
    return {
      accentColor: homeDashboardColors.accentBlue,
      badgeBackgroundColor: homeDashboardColors.surfaceMuted,
      badgeTextColor: homeDashboardColors.accentBlue,
      bodyColor: homeDashboardColors.inkSoft,
      headlineColor: homeDashboardColors.ink,
      overlayAccentColor: homeDashboardColors.pearlMist,
      overlayBaseBottomColor: homeDashboardColors.paperMuted,
      overlayBaseTopColor: homeDashboardColors.pearlIvory,
      overlayCoolColor: homeDashboardColors.pearlMist,
      overlayWarmColor: homeDashboardColors.pearlGlow,
      supportingColor: homeDashboardColors.inkSoft,
    };
  }

  return {
    accentColor: homeDashboardColors.accentRed,
    badgeBackgroundColor: homeDashboardColors.accentRedSoft,
    badgeTextColor: homeDashboardColors.accentRed,
    bodyColor: homeDashboardColors.inkSoft,
    headlineColor: homeDashboardColors.ink,
    overlayAccentColor: homeDashboardColors.pearlPeach,
    overlayBaseBottomColor: homeDashboardColors.paperStrong,
    overlayBaseTopColor: homeDashboardColors.pearlIvory,
    overlayCoolColor: homeDashboardColors.pearlMist,
    overlayWarmColor: homeDashboardColors.pearlPeach,
    supportingColor: homeDashboardColors.inkSoft,
  };
};

const getStateIcon = (state: AllergiesPassportHeroState): React.JSX.Element => {
  if (state === 'loading') {
    return <Loader2 color={homeDashboardColors.inkSoft} size={16} />;
  }

  if (state === 'empty') {
    return <CirclePlus color={homeDashboardColors.accentAmber} size={16} />;
  }

  if (state === 'personalized') {
    return <BadgeCheck color={homeDashboardColors.accentGreen} size={16} />;
  }

  if (state === 'generic') {
    return <Sparkles color={homeDashboardColors.accentBlue} size={16} />;
  }

  return <ShieldAlert color={homeDashboardColors.accentRed} size={16} />;
};

export function AllergiesTravelerPassportCard({
  state,
  copy,
  onPress,
  style,
}: AllergiesTravelerPassportCardProps): React.JSX.Element {
  const tone = getCardTone(state);

  const content = (
    <>
      <PearlSurfaceOverlay
        accentWashColor={tone.overlayAccentColor}
        baseBottomColor={tone.overlayBaseBottomColor}
        baseTopColor={tone.overlayBaseTopColor}
        coolWashColor={tone.overlayCoolColor}
        warmWashColor={tone.overlayWarmColor}
      />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={[styles.badge, { backgroundColor: tone.badgeBackgroundColor }]}>
            {getStateIcon(state)}
            <Text style={[styles.badgeText, { color: tone.badgeTextColor }]}>
              {copy.badgeLabel}
            </Text>
          </View>

          {copy.languageLabel ? (
            <View style={styles.languageBadge}>
              <Text style={[styles.languageBadgeText, { color: tone.supportingColor }]}>
                {copy.languageLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {state === 'loading' ? (
          <View style={styles.loadingBlock}>
            <View style={[styles.loadingLine, styles.loadingLineWide]} />
            <View style={[styles.loadingLine, styles.loadingLineMedium]} />
            <View style={[styles.loadingLine, styles.loadingLineShort]} />
          </View>
        ) : (
          <View style={styles.copyBlock}>
            <Text style={[styles.headline, { color: tone.headlineColor }]} numberOfLines={3}>
              {copy.headline}
            </Text>

            <Text style={[styles.message, { color: tone.bodyColor }]} numberOfLines={6}>
              {copy.message}
            </Text>
          </View>
        )}

        {copy.supportingLabel ? (
          <View style={styles.footerRow}>
            <Text style={[styles.supportingLabel, { color: tone.supportingColor }]}>
              {copy.supportingLabel}
            </Text>
          </View>
        ) : null}
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.card,
          {
            borderColor: homeDashboardColors.lineStrong,
            shadowColor: tone.accentColor,
          },
          pressed ? styles.cardPressed : null,
          style,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: homeDashboardColors.lineStrong,
          shadowColor: tone.accentColor,
        },
        style,
      ]}
    >
      {content}
    </View>
  );
}

export default AllergiesTravelerPassportCard;

const styles = StyleSheet.create({
  card: {
    borderRadius: homeDashboardRadii.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
    padding: homeDashboardSpacing.md,
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 26,
    elevation: 3,
  },
  cardPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.985 }],
  },
  content: {
    gap: homeDashboardSpacing.md,
    zIndex: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: homeDashboardSpacing.sm,
  },
  badge: {
    minHeight: 30,
    paddingHorizontal: homeDashboardSpacing.sm,
    borderRadius: homeDashboardRadii.pill,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badgeText: {
    fontSize: homeDashboardTypography.caption,
    lineHeight: 14,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  languageBadge: {
    minHeight: 30,
    paddingHorizontal: homeDashboardSpacing.sm,
    borderRadius: homeDashboardRadii.pill,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    justifyContent: 'center',
    backgroundColor: homeDashboardColors.surfaceMuted,
  },
  languageBadgeText: {
    fontSize: homeDashboardTypography.caption,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  copyBlock: {
    gap: homeDashboardSpacing.sm,
  },
  headline: {
    fontSize: 28,
    lineHeight: 30,
    letterSpacing: -1,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  message: {
    fontSize: homeDashboardTypography.body,
    lineHeight: 21,
    fontWeight: '500',
  },
  footerRow: {
    paddingTop: homeDashboardSpacing.xs,
  },
  supportingLabel: {
    fontSize: homeDashboardTypography.micro,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  loadingBlock: {
    gap: homeDashboardSpacing.sm,
    paddingVertical: homeDashboardSpacing.xs,
  },
  loadingLine: {
    height: 14,
    borderRadius: homeDashboardRadii.pill,
    backgroundColor: 'rgba(23, 32, 51, 0.08)',
  },
  loadingLineWide: {
    width: '84%',
  },
  loadingLineMedium: {
    width: '68%',
  },
  loadingLineShort: {
    width: '46%',
    height: 12,
  },
});
