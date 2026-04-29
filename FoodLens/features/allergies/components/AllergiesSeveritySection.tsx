import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  CircleSlash2,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react-native';

import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardSpacing,
  homeDashboardTypography,
  type HomeDashboardColors,
} from '../../home/components/homeDashboardTokens';
import { homeDashboardStyles } from '../../home/components/homeDashboardStyles';

export type AllergiesSeverityGroupKind = 'severe' | 'moderate' | 'mild' | 'dietaryRestrictions';

export type AllergiesSeveritySectionItem = Readonly<{
  id: string;
  primaryLabel: string;
  secondaryLabel: string;
}>;

export type AllergiesSeveritySectionProps = Readonly<{
  colors: HomeDashboardColors;
  kind: AllergiesSeverityGroupKind;
  title: string;
  subtitle?: string;
  items: readonly AllergiesSeveritySectionItem[];
}>;

type SeverityTone = Readonly<{
  accentColor: string;
  badgeBackgroundColor: string;
  badgeBorderColor: string;
  cardBackgroundColor: string;
  iconBackgroundColor: string;
  iconColor: string;
}>;

type SeverityIconProps = Readonly<{
  color: string;
  kind: AllergiesSeverityGroupKind;
  size: number;
  strokeWidth: number;
}>;

const getSeverityTone = (
  colors: HomeDashboardColors,
  kind: AllergiesSeverityGroupKind,
): SeverityTone => {
  if (kind === 'severe') {
    return {
      accentColor: colors.accentRed,
      badgeBackgroundColor: colors.accentRedSoft,
      badgeBorderColor: colors.accentRed,
      cardBackgroundColor: colors.accentRedSoft,
      iconBackgroundColor: colors.accentRedSoft,
      iconColor: colors.accentRed,
    };
  }

  if (kind === 'mild') {
    return {
      accentColor: colors.accentGreen,
      badgeBackgroundColor: colors.accentGreenSoft,
      badgeBorderColor: colors.accentGreen,
      cardBackgroundColor: colors.accentGreenSoft,
      iconBackgroundColor: colors.accentGreenSoft,
      iconColor: colors.accentGreen,
    };
  }

  if (kind === 'dietaryRestrictions') {
    return {
      accentColor: colors.accentBlue,
      badgeBackgroundColor: colors.surfaceMuted,
      badgeBorderColor: colors.line,
      cardBackgroundColor: colors.surfaceMuted,
      iconBackgroundColor: colors.surfaceMuted,
      iconColor: colors.accentBlue,
    };
  }

  return {
    accentColor: colors.accentAmber,
    badgeBackgroundColor: colors.accentAmberSoft,
    badgeBorderColor: colors.accentAmber,
    cardBackgroundColor: colors.accentAmberSoft,
    iconBackgroundColor: colors.accentAmberSoft,
    iconColor: colors.accentAmber,
  };
};

const getSeverityIcon = (
  colors: HomeDashboardColors,
  kind: AllergiesSeverityGroupKind,
): React.JSX.Element => {
  const iconProps: SeverityIconProps = {
    color: getSeverityTone(colors, kind).iconColor,
    kind,
    size: 18,
    strokeWidth: 2.2,
  };

  if (iconProps.kind === 'severe') {
    return <ShieldAlert color={iconProps.color} size={iconProps.size} strokeWidth={iconProps.strokeWidth} />;
  }

  if (iconProps.kind === 'mild') {
    return <ShieldCheck color={iconProps.color} size={iconProps.size} strokeWidth={iconProps.strokeWidth} />;
  }

  if (iconProps.kind === 'dietaryRestrictions') {
    return <CircleSlash2 color={iconProps.color} size={iconProps.size} strokeWidth={iconProps.strokeWidth} />;
  }

  return <TriangleAlert color={iconProps.color} size={iconProps.size} strokeWidth={iconProps.strokeWidth} />;
};

export function AllergiesSeveritySection({
  colors,
  kind,
  title,
  subtitle,
  items,
}: AllergiesSeveritySectionProps): React.JSX.Element | null {
  if (items.length === 0) {
    return null;
  }

  const tone = getSeverityTone(colors, kind);

  return (
    <View
      style={[
        localStyles.sectionCard,
        { backgroundColor: tone.cardBackgroundColor, borderColor: colors.line },
      ]}
    >
      <View style={homeDashboardStyles.sectionHeaderRow}>
        <View style={homeDashboardStyles.sectionHeaderCopy}>
          <Text style={[localStyles.sectionTitle, { color: colors.ink }]}>{title}</Text>
          {typeof subtitle === 'string' && subtitle.trim().length > 0 ? (
            <Text style={[localStyles.sectionSubtitle, { color: colors.inkSoft }]}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        <View
          style={[
            homeDashboardStyles.pill,
            localStyles.countPill,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.line },
          ]}
        >
          <Text style={[homeDashboardStyles.pillText, localStyles.countPillText, { color: colors.ink }]}>
            {String(items.length)}
          </Text>
        </View>
      </View>

      <View style={localStyles.items}>
        {items.map((item) => (
          <View
            key={item.id}
            style={[
              localStyles.itemCard,
              {
                backgroundColor: colors.pearlIvory,
                borderColor: tone.badgeBorderColor,
              },
            ]}
          >
            <View
              style={[
                localStyles.iconFrame,
                {
                  backgroundColor: tone.iconBackgroundColor,
                },
              ]}
            >
              {getSeverityIcon(colors, kind)}
            </View>

            <View style={localStyles.itemCopy}>
              <Text numberOfLines={1} style={[localStyles.itemPrimary, { color: colors.ink }]}>
                {item.primaryLabel}
              </Text>
              <Text numberOfLines={2} style={[localStyles.itemSecondary, { color: colors.inkSoft }]}>
                {item.secondaryLabel}
              </Text>
            </View>

            <View
              style={[
                homeDashboardStyles.pill,
                localStyles.itemBadge,
                {
                  backgroundColor: tone.badgeBackgroundColor,
                  borderColor: tone.badgeBorderColor,
                },
              ]}
            >
              <Text style={[homeDashboardStyles.pillText, localStyles.itemBadgeText, { color: tone.accentColor }]}>
                {title}
              </Text>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export default AllergiesSeveritySection;

const localStyles = StyleSheet.create({
  sectionCard: {
    borderColor: homeDashboardColors.line,
    borderCurve: 'continuous',
    borderRadius: homeDashboardRadii.lg,
    borderWidth: 1,
    overflow: 'hidden',
    gap: homeDashboardSpacing.md,
    padding: homeDashboardSpacing.md,
  },
  sectionTitle: {
    color: homeDashboardColors.ink,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
    lineHeight: 22,
  },
  sectionSubtitle: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '600',
    letterSpacing: 0.2,
    lineHeight: 16,
  },
  countPill: {
    minWidth: 40,
    backgroundColor: homeDashboardColors.surfaceMuted,
  },
  countPillText: {
    color: homeDashboardColors.ink,
  },
  items: {
    gap: homeDashboardSpacing.sm,
  },
  itemCard: {
    alignItems: 'center',
    borderRadius: homeDashboardRadii.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    flexDirection: 'row',
    gap: homeDashboardSpacing.sm,
    paddingHorizontal: homeDashboardSpacing.sm,
    paddingVertical: homeDashboardSpacing.sm,
  },
  iconFrame: {
    alignItems: 'center',
    borderRadius: homeDashboardRadii.md,
    borderCurve: 'continuous',
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  itemCopy: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  itemPrimary: {
    color: homeDashboardColors.ink,
    fontSize: homeDashboardTypography.bodyStrong,
    fontWeight: '800',
    lineHeight: 20,
  },
  itemSecondary: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '600',
    lineHeight: 16,
  },
  itemBadge: {
    flexShrink: 0,
    minHeight: 28,
    paddingHorizontal: homeDashboardSpacing.sm,
  },
  itemBadgeText: {
    letterSpacing: 0.5,
  },
});
