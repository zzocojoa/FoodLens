import { StyleSheet } from 'react-native';

import {
  historyDashboardColors as colors,
  historyDashboardRadii as radii,
  historyDashboardRedline as redline,
  historyDashboardSectionSpacing as sectionSpacing,
  historyDashboardSpacing as spacing,
  historyDashboardTypography as typography,
} from './historyDashboardTokens';

export const historyDashboardStyles = StyleSheet.create({
  atlasRailInset: {
    paddingHorizontal: spacing.lg,
  },
  atlasScreenContent: {
    flex: 1,
    gap: sectionSpacing.sectionStack,
    paddingTop: sectionSpacing.pageTop,
  },
  atlasStage: {
    flex: 1,
  },
  screenBackground: {
    backgroundColor: colors.paper,
    flex: 1,
  },
  scrollContent: {
    gap: sectionSpacing.sectionStack,
    paddingBottom: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    paddingTop: sectionSpacing.pageTop,
  },
  sectionCard: {
    backgroundColor: colors.surfaceStrong,
    borderColor: colors.line,
    borderCurve: 'continuous',
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  sectionContent: {
    gap: sectionSpacing.compactStack,
    padding: sectionSpacing.sectionInset,
  },
  eyebrow: {
    color: colors.inkSoft,
    fontSize: typography.caption,
    fontWeight: '700',
    letterSpacing: 0.8,
    lineHeight: 16,
    textTransform: 'uppercase',
  },
  title: {
    color: colors.ink,
    fontSize: typography.section,
    fontWeight: '800',
    lineHeight: 30,
  },
  body: {
    color: colors.inkSoft,
    fontSize: typography.body,
    lineHeight: 20,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  chapterTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: sectionSpacing.compactStack,
  },
  sectionRedline: {
    backgroundColor: redline.color,
    height: redline.height,
    marginHorizontal: sectionSpacing.redlineInset,
    opacity: redline.opacity,
  },
});
