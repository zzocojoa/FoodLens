import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { homeDashboardColors, homeDashboardRadii, homeDashboardSpacing, homeDashboardTypography } from '../../home/components/homeDashboardTokens';
import { homeDashboardStyles } from '../../home/components/homeDashboardStyles';
import PearlSurfaceOverlay from '../../home/components/PearlSurfaceOverlay';
import {
  type AllergiesSeverityGroupKind,
  type AllergiesSeveritySectionItem,
  AllergiesSeveritySection,
} from './AllergiesSeveritySection';

export type AllergiesRiskLedgerSection = Readonly<{
  kind: AllergiesSeverityGroupKind;
  title: string;
  subtitle?: string;
  items: ReadonlyArray<AllergiesSeveritySectionItem>;
}>;

export type AllergiesRiskLedgerProps = Readonly<{
  title: string;
  meta: string;
  sections: ReadonlyArray<AllergiesRiskLedgerSection>;
  emptyTitle?: string;
  emptyDescription?: string;
}>;

const LEDGER_ORDER: ReadonlyArray<AllergiesSeverityGroupKind> = [
  'severe',
  'moderate',
  'mild',
  'dietaryRestrictions',
];

const getOrderedSections = (
  sections: ReadonlyArray<AllergiesRiskLedgerSection>,
): ReadonlyArray<AllergiesRiskLedgerSection> => {
  return LEDGER_ORDER.flatMap((kind) => {
    const section = sections.find((entry) => entry.kind === kind);

    return typeof section === 'undefined' ? [] : [section];
  });
};

export function AllergiesRiskLedger({
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
      <View style={[homeDashboardStyles.sectionCard, localStyles.container]}>
        <PearlSurfaceOverlay
          accentWashColor={homeDashboardColors.pearlMist}
          baseBottomColor="#FFF8F0"
          baseTopColor={homeDashboardColors.pearlIvory}
          coolWashColor={homeDashboardColors.pearlSage}
          warmWashColor={homeDashboardColors.pearlPeach}
        />
        <View style={homeDashboardStyles.sectionHeaderRow}>
          <View style={homeDashboardStyles.sectionHeaderCopy}>
            <Text style={localStyles.title}>{title}</Text>
            <Text style={localStyles.meta}>{meta}</Text>
          </View>

          <View style={[homeDashboardStyles.pill, localStyles.countPill]}>
            <Text style={[homeDashboardStyles.pillText, localStyles.countPillText]}>0</Text>
          </View>
        </View>

        <View style={localStyles.emptyState}>
          <Text style={localStyles.emptyTitle}>{emptyTitle}</Text>
          {typeof emptyDescription === 'string' && emptyDescription.trim().length > 0 ? (
            <Text style={localStyles.emptyDescription}>{emptyDescription}</Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={[homeDashboardStyles.sectionCard, localStyles.container]}>
      <PearlSurfaceOverlay
        accentWashColor={homeDashboardColors.pearlMist}
        baseBottomColor="#FFF8F0"
        baseTopColor={homeDashboardColors.pearlIvory}
        coolWashColor={homeDashboardColors.pearlSage}
        warmWashColor={homeDashboardColors.pearlPeach}
      />
      <View style={homeDashboardStyles.sectionHeaderRow}>
        <View style={homeDashboardStyles.sectionHeaderCopy}>
          <Text style={localStyles.title}>{title}</Text>
          <Text style={localStyles.meta}>{meta}</Text>
        </View>

        <View style={[homeDashboardStyles.pill, localStyles.countPill]}>
          <Text style={[homeDashboardStyles.pillText, localStyles.countPillText]}>
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
