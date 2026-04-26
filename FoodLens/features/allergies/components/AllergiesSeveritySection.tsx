import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  CircleSlash2,
  ShieldAlert,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react-native';

import { homeDashboardColors, homeDashboardRadii, homeDashboardSpacing, homeDashboardTypography } from '../../home/components/homeDashboardTokens';
import { homeDashboardStyles } from '../../home/components/homeDashboardStyles';

export type AllergiesSeverityGroupKind = 'severe' | 'moderate' | 'mild' | 'dietaryRestrictions';

export type AllergiesSeveritySectionItem = Readonly<{
  id: string;
  primaryLabel: string;
  secondaryLabel: string;
}>;

export type AllergiesSeveritySectionProps = Readonly<{
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

const getSeverityTone = (kind: AllergiesSeverityGroupKind): SeverityTone => {
  if (kind === 'severe') {
    return {
      accentColor: homeDashboardColors.accentRed,
      badgeBackgroundColor: homeDashboardColors.accentRedSoft,
      badgeBorderColor: 'rgba(185, 70, 62, 0.18)',
      cardBackgroundColor: 'rgba(255, 248, 246, 0.88)',
      iconBackgroundColor: 'rgba(185, 70, 62, 0.12)',
      iconColor: homeDashboardColors.accentRed,
    };
  }

  if (kind === 'mild') {
    return {
      accentColor: homeDashboardColors.accentGreen,
      badgeBackgroundColor: homeDashboardColors.accentGreenSoft,
      badgeBorderColor: 'rgba(31, 107, 79, 0.18)',
      cardBackgroundColor: 'rgba(247, 251, 247, 0.88)',
      iconBackgroundColor: 'rgba(31, 107, 79, 0.12)',
      iconColor: homeDashboardColors.accentGreen,
    };
  }

  if (kind === 'dietaryRestrictions') {
    return {
      accentColor: homeDashboardColors.accentBlue,
      badgeBackgroundColor: 'rgba(36, 56, 93, 0.10)',
      badgeBorderColor: 'rgba(36, 56, 93, 0.16)',
      cardBackgroundColor: 'rgba(246, 248, 252, 0.90)',
      iconBackgroundColor: 'rgba(36, 56, 93, 0.11)',
      iconColor: homeDashboardColors.accentBlue,
    };
  }

  return {
    accentColor: homeDashboardColors.accentAmber,
    badgeBackgroundColor: homeDashboardColors.accentAmberSoft,
    badgeBorderColor: 'rgba(170, 106, 19, 0.18)',
    cardBackgroundColor: 'rgba(255, 249, 240, 0.88)',
    iconBackgroundColor: 'rgba(170, 106, 19, 0.12)',
    iconColor: homeDashboardColors.accentAmber,
  };
};

const getSeverityIcon = (kind: AllergiesSeverityGroupKind): React.JSX.Element => {
  const iconProps: SeverityIconProps = {
    color: getSeverityTone(kind).iconColor,
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
  kind,
  title,
  subtitle,
  items,
}: AllergiesSeveritySectionProps): React.JSX.Element | null {
  if (items.length === 0) {
    return null;
  }

  const tone = getSeverityTone(kind);

  return (
    <View style={[localStyles.sectionCard, { backgroundColor: tone.cardBackgroundColor }]}>
      <View style={homeDashboardStyles.sectionHeaderRow}>
        <View style={homeDashboardStyles.sectionHeaderCopy}>
          <Text style={localStyles.sectionTitle}>{title}</Text>
          {typeof subtitle === 'string' && subtitle.trim().length > 0 ? (
            <Text style={localStyles.sectionSubtitle}>{subtitle}</Text>
          ) : null}
        </View>

        <View style={[homeDashboardStyles.pill, localStyles.countPill]}>
          <Text style={[homeDashboardStyles.pillText, localStyles.countPillText]}>
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
                backgroundColor: homeDashboardColors.pearlIvory,
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
              {getSeverityIcon(kind)}
            </View>

            <View style={localStyles.itemCopy}>
              <Text numberOfLines={1} style={localStyles.itemPrimary}>
                {item.primaryLabel}
              </Text>
              <Text numberOfLines={2} style={localStyles.itemSecondary}>
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
