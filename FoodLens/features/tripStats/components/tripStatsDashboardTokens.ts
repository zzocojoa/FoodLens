import {
  homeDashboardColors,
  homeDashboardRadii,
  homeDashboardShadows,
  homeDashboardSpacing,
  homeDashboardTypography,
  homeDashboardSignalColors,
} from '../../home/components/homeDashboardTokens';

export const tripStatsDashboardColors = homeDashboardColors;

export const tripStatsDashboardSpacing = homeDashboardSpacing;

export const tripStatsDashboardRadii = homeDashboardRadii;

export const tripStatsDashboardTypography = homeDashboardTypography;

export const tripStatsDashboardShadows = homeDashboardShadows;

export const tripStatsDashboardSignalColors = homeDashboardSignalColors;

export const tripStatsDashboardSectionOrder = [
  'rail',
  'hero',
  'totals',
  'chapters',
  'feed',
  'action',
] as const;

export type TripStatsDashboardSectionKey = (typeof tripStatsDashboardSectionOrder)[number];

