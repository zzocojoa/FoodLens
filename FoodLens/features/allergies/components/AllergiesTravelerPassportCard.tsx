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

import { PearlSurfaceOverlay } from '../../home/components/PearlSurfaceOverlay';
import {
  homeDashboardRadii,
  homeDashboardSpacing,
  homeDashboardTypography,
  type HomeDashboardColors,
  type HomeDashboardColorScheme,
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
  colorScheme: HomeDashboardColorScheme;
  colors: HomeDashboardColors;
  state: AllergiesPassportHeroState;
  copy: AllergiesPassportCardCopy;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
};

const getCardTone = (
  colors: HomeDashboardColors,
  state: AllergiesPassportHeroState,
): AllergiesTravelerPassportCardTone => {
  if (state === 'loading') {
    return {
      accentColor: colors.inkSoft,
      badgeBackgroundColor: colors.surfaceMuted,
      badgeTextColor: colors.inkSoft,
      bodyColor: colors.inkSoft,
      headlineColor: colors.ink,
      overlayAccentColor: colors.pearlMist,
      overlayBaseBottomColor: colors.paperStrong,
      overlayBaseTopColor: colors.pearlIvory,
      overlayCoolColor: colors.pearlGlow,
      overlayWarmColor: colors.pearlMist,
      supportingColor: colors.inkSoft,
    };
  }

  if (state === 'empty') {
    return {
      accentColor: colors.accentAmber,
      badgeBackgroundColor: colors.accentAmberSoft,
      badgeTextColor: colors.accentAmber,
      bodyColor: colors.inkSoft,
      headlineColor: colors.ink,
      overlayAccentColor: colors.pearlPeach,
      overlayBaseBottomColor: colors.paper,
      overlayBaseTopColor: colors.pearlIvory,
      overlayCoolColor: colors.pearlGlow,
      overlayWarmColor: colors.pearlPeach,
      supportingColor: colors.inkSoft,
    };
  }

  if (state === 'personalized') {
    return {
      accentColor: colors.accentGreen,
      badgeBackgroundColor: colors.accentGreenSoft,
      badgeTextColor: colors.accentGreen,
      bodyColor: colors.inkSoft,
      headlineColor: colors.ink,
      overlayAccentColor: colors.pearlSage,
      overlayBaseBottomColor: colors.paperStrong,
      overlayBaseTopColor: colors.pearlIvory,
      overlayCoolColor: colors.pearlSage,
      overlayWarmColor: colors.pearlGlow,
      supportingColor: colors.inkSoft,
    };
  }

  if (state === 'generic') {
    return {
      accentColor: colors.accentBlue,
      badgeBackgroundColor: colors.surfaceMuted,
      badgeTextColor: colors.accentBlue,
      bodyColor: colors.inkSoft,
      headlineColor: colors.ink,
      overlayAccentColor: colors.pearlMist,
      overlayBaseBottomColor: colors.paperMuted,
      overlayBaseTopColor: colors.pearlIvory,
      overlayCoolColor: colors.pearlMist,
      overlayWarmColor: colors.pearlGlow,
      supportingColor: colors.inkSoft,
    };
  }

  return {
    accentColor: colors.accentRed,
    badgeBackgroundColor: colors.accentRedSoft,
    badgeTextColor: colors.accentRed,
    bodyColor: colors.inkSoft,
    headlineColor: colors.ink,
    overlayAccentColor: colors.pearlPeach,
    overlayBaseBottomColor: colors.paperStrong,
    overlayBaseTopColor: colors.pearlIvory,
    overlayCoolColor: colors.pearlMist,
    overlayWarmColor: colors.pearlPeach,
    supportingColor: colors.inkSoft,
  };
};

const getStateIcon = (
  colors: HomeDashboardColors,
  state: AllergiesPassportHeroState,
): React.JSX.Element => {
  if (state === 'loading') {
    return <Loader2 color={colors.inkSoft} size={16} />;
  }

  if (state === 'empty') {
    return <CirclePlus color={colors.accentAmber} size={16} />;
  }

  if (state === 'personalized') {
    return <BadgeCheck color={colors.accentGreen} size={16} />;
  }

  if (state === 'generic') {
    return <Sparkles color={colors.accentBlue} size={16} />;
  }

  return <ShieldAlert color={colors.accentRed} size={16} />;
};

export function AllergiesTravelerPassportCard({
  colorScheme,
  colors,
  state,
  copy,
  onPress,
  style,
}: AllergiesTravelerPassportCardProps): React.JSX.Element {
  const tone = getCardTone(colors, state);

  const content = (
    <>
      {colorScheme === 'light' ? (
        <PearlSurfaceOverlay
          accentWashColor={tone.overlayAccentColor}
          baseBottomColor={tone.overlayBaseBottomColor}
          baseTopColor={tone.overlayBaseTopColor}
          coolWashColor={tone.overlayCoolColor}
          warmWashColor={tone.overlayWarmColor}
        />
      ) : null}

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View
            style={[
              styles.badge,
              { backgroundColor: tone.badgeBackgroundColor, borderColor: colors.line },
            ]}
          >
            {getStateIcon(colors, state)}
            <Text style={[styles.badgeText, { color: tone.badgeTextColor }]}>
              {copy.badgeLabel}
            </Text>
          </View>

          {copy.languageLabel ? (
            <View
              style={[
                styles.languageBadge,
                { backgroundColor: colors.surfaceMuted, borderColor: colors.line },
              ]}
            >
              <Text style={[styles.languageBadgeText, { color: tone.supportingColor }]}>
                {copy.languageLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {state === 'loading' ? (
          <View style={styles.loadingBlock}>
            <View
              style={[
                styles.loadingLine,
                styles.loadingLineWide,
                { backgroundColor: colors.surfaceMuted },
              ]}
            />
            <View
              style={[
                styles.loadingLine,
                styles.loadingLineMedium,
                { backgroundColor: colors.surfaceMuted },
              ]}
            />
            <View
              style={[
                styles.loadingLine,
                styles.loadingLineShort,
                { backgroundColor: colors.surfaceMuted },
              ]}
            />
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
            backgroundColor: colors.surfaceStrong,
            borderColor: colors.lineStrong,
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
          backgroundColor: colors.surfaceStrong,
          borderColor: colors.lineStrong,
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
    justifyContent: 'center',
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
