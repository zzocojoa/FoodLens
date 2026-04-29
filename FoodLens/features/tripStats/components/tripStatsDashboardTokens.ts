import {
  getHomeDashboardAccentForegroundColor,
  homeDashboardColors,
  getHomeDashboardColors,
  getHomeDashboardSignalColors,
  homeDashboardRadii,
  homeDashboardShadows,
  homeDashboardSpacing,
  homeDashboardTypography,
  homeDashboardSignalColors,
  type HomeDashboardColorScheme,
  type HomeDashboardColors,
} from '../../home/components/homeDashboardTokens';

export const tripStatsDashboardColors = homeDashboardColors;

export const tripStatsDashboardSpacing = homeDashboardSpacing;

export const tripStatsDashboardRadii = homeDashboardRadii;

export const tripStatsDashboardTypography = homeDashboardTypography;

export const tripStatsDashboardShadows = homeDashboardShadows;

export const tripStatsDashboardSignalColors = homeDashboardSignalColors;

export const getTripStatsDashboardColors = getHomeDashboardColors;

export const getTripStatsDashboardSignalColors = getHomeDashboardSignalColors;

export const getTripStatsDashboardAccentForegroundColor = getHomeDashboardAccentForegroundColor;

export type TripStatsDashboardColorScheme = HomeDashboardColorScheme;

export type TripStatsDashboardColors = HomeDashboardColors;

export const tripStatsDashboardSectionOrder = [
  'rail',
  'hero',
  'totals',
  'chapters',
  'feed',
  'action',
] as const;

export type TripStatsDashboardSectionKey = (typeof tripStatsDashboardSectionOrder)[number];
