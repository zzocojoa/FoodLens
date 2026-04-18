import { StyleSheet } from 'react-native';

import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardShadows,
  homeDashboardSpacing,
  homeDashboardTypography,
} from './homeDashboardTokens';

export const homeDashboardStyles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: homeDashboardSpacing.xl,
    gap: homeDashboardSpacing.lg,
  },
  screenBackground: {
    flex: 1,
    backgroundColor: homeDashboardColors.paper,
  },
  grainLayer: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.18,
    backgroundColor: 'transparent',
  },
  sectionCard: {
    borderRadius: homeDashboardRadii.lg,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    backgroundColor: homeDashboardColors.surface,
    padding: homeDashboardSpacing.md,
    gap: homeDashboardSpacing.sm,
    boxShadow: homeDashboardShadows.card,
  },
  elevatedCard: {
    borderRadius: homeDashboardRadii.xl,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    backgroundColor: homeDashboardColors.surfaceStrong,
    padding: homeDashboardSpacing.lg,
    gap: homeDashboardSpacing.md,
    boxShadow: homeDashboardShadows.hero,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: homeDashboardSpacing.sm,
  },
  sectionHeaderCopy: {
    flex: 1,
    gap: homeDashboardSpacing.xs,
  },
  sectionTitle: {
    fontSize: homeDashboardTypography.section,
    lineHeight: 26,
    fontWeight: '700',
    color: homeDashboardColors.ink,
  },
  sectionMeta: {
    fontSize: homeDashboardTypography.caption,
    lineHeight: 16,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: homeDashboardColors.inkSoft,
  },
  pill: {
    minHeight: 30,
    paddingHorizontal: homeDashboardSpacing.sm,
    borderRadius: homeDashboardRadii.pill,
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: homeDashboardColors.line,
    backgroundColor: homeDashboardColors.surfaceMuted,
  },
  pillText: {
    fontSize: homeDashboardTypography.caption,
    lineHeight: 14,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: homeDashboardColors.inkSoft,
  },
});
