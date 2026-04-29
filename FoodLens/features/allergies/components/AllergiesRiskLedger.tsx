import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardSpacing,
  homeDashboardTypography,
  type HomeDashboardColors,
  type HomeDashboardColorScheme,
} from '../../home/components/homeDashboardTokens';
import { homeDashboardStyles } from '../../home/components/homeDashboardStyles';
import { PearlSurfaceOverlay } from '../../home/components/PearlSurfaceOverlay';
import {
  type AllergiesSeverityGroupKind,
  type AllergiesSeveritySectionItem,
  AllergiesSeveritySection,
} from './AllergiesSeveritySection';

export type AllergiesRiskLedgerSection = Readonly<{
  kind: AllergiesSeverityGroupKind;
  title: string;
  subtitle?: string;
  items: readonly AllergiesSeveritySectionItem[];
}>;

export type AllergiesRiskLedgerProps = Readonly<{
  colorScheme: HomeDashboardColorScheme;
  colors: HomeDashboardColors;
  title: string;
  meta: string;
  sections: readonly AllergiesRiskLedgerSection[];
  emptyTitle?: string;
  emptyDescription?: string;
}>;

const LEDGER_ORDER: readonly AllergiesSeverityGroupKind[] = [
  'severe',
  'moderate',
  'mild',
  'dietaryRestrictions',
];

const getOrderedSections = (
  sections: readonly AllergiesRiskLedgerSection[],
): readonly AllergiesRiskLedgerSection[] => {
  return LEDGER_ORDER.flatMap((kind) => {
    const section = sections.find((entry) => entry.kind === kind);

    return typeof section === 'undefined' ? [] : [section];
  });
};

export function AllergiesRiskLedger({
  colorScheme,
  colors,
  title,
  meta,
  sections,
  emptyTitle,
  emptyDescription,
}: AllergiesRiskLedgerProps): React.JSX.Element | null {
  const orderedSections = getOrderedSections(sections);
  const totalCount = orderedSections.reduce((sum, section) => sum + section.items.length, 0);

  if (totalCount === 0) {
    if (typeof emptyTitle !== 'string' || emptyTitle.trim().length === 0) {
      return null;
    }

    return (
      <View
        style={[
          homeDashboardStyles.sectionCard,
          localStyles.container,
          { backgroundColor: colors.surface, borderColor: colors.line },
        ]}
      >
        {colorScheme === 'light' ? (
          <PearlSurfaceOverlay
            accentWashColor={colors.pearlMist}
            baseBottomColor="#FFF8F0"
            baseTopColor={colors.pearlIvory}
            coolWashColor={colors.pearlSage}
            warmWashColor={colors.pearlPeach}
          />
        ) : null}
        <View style={homeDashboardStyles.sectionHeaderRow}>
          <View style={homeDashboardStyles.sectionHeaderCopy}>
            <Text style={[localStyles.title, { color: colors.ink }]}>{title}</Text>
            <Text style={[localStyles.meta, { color: colors.inkSoft }]}>{meta}</Text>
          </View>

          <View
            style={[
              homeDashboardStyles.pill,
              localStyles.countPill,
              { backgroundColor: colors.surfaceMuted, borderColor: colors.line },
            ]}
          >
            <Text style={[homeDashboardStyles.pillText, localStyles.countPillText, { color: colors.ink }]}>
              0
            </Text>
          </View>
        </View>

        <View
          style={[
            localStyles.emptyState,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.line },
          ]}
        >
          <Text style={[localStyles.emptyTitle, { color: colors.ink }]}>{emptyTitle}</Text>
          {typeof emptyDescription === 'string' && emptyDescription.trim().length > 0 ? (
            <Text style={[localStyles.emptyDescription, { color: colors.inkSoft }]}>
              {emptyDescription}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        homeDashboardStyles.sectionCard,
        localStyles.container,
        { backgroundColor: colors.surface, borderColor: colors.line },
      ]}
    >
      {colorScheme === 'light' ? (
        <PearlSurfaceOverlay
          accentWashColor={colors.pearlMist}
          baseBottomColor="#FFF8F0"
          baseTopColor={colors.pearlIvory}
          coolWashColor={colors.pearlSage}
          warmWashColor={colors.pearlPeach}
        />
      ) : null}
      <View style={homeDashboardStyles.sectionHeaderRow}>
        <View style={homeDashboardStyles.sectionHeaderCopy}>
          <Text style={[localStyles.title, { color: colors.ink }]}>{title}</Text>
          <Text style={[localStyles.meta, { color: colors.inkSoft }]}>{meta}</Text>
        </View>

        <View
          style={[
            homeDashboardStyles.pill,
            localStyles.countPill,
            { backgroundColor: colors.surfaceMuted, borderColor: colors.line },
          ]}
        >
          <Text style={[homeDashboardStyles.pillText, localStyles.countPillText, { color: colors.ink }]}>
            {String(totalCount)}
          </Text>
        </View>
      </View>

      <View style={localStyles.sections}>
        {orderedSections.map((section) => (
          <AllergiesSeveritySection
            key={section.kind}
            kind={section.kind}
            title={section.title}
            subtitle={section.subtitle}
            items={section.items}
            colors={colors}
          />
        ))}
      </View>
    </View>
  );
}

export default AllergiesRiskLedger;

const localStyles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    position: 'relative',
    gap: homeDashboardSpacing.md,
  },
  title: {
    color: homeDashboardColors.ink,
    fontSize: homeDashboardTypography.section,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 28,
  },
  meta: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '700',
    letterSpacing: 0.9,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  countPill: {
    minWidth: 44,
    backgroundColor: homeDashboardColors.surfaceMuted,
  },
  countPillText: {
    color: homeDashboardColors.ink,
  },
  sections: {
    gap: homeDashboardSpacing.sm,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: homeDashboardColors.surfaceMuted,
    borderRadius: homeDashboardRadii.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    gap: homeDashboardSpacing.xs,
    paddingHorizontal: homeDashboardSpacing.md,
    paddingVertical: homeDashboardSpacing.xl,
  },
  emptyTitle: {
    color: homeDashboardColors.ink,
    fontSize: homeDashboardTypography.bodyStrong,
    fontWeight: '800',
    lineHeight: 20,
    textAlign: 'center',
  },
  emptyDescription: {
    color: homeDashboardColors.inkSoft,
    fontSize: homeDashboardTypography.caption,
    fontWeight: '600',
    lineHeight: 17,
    textAlign: 'center',
  },
});
