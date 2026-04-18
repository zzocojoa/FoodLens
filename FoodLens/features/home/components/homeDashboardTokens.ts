export const homeDashboardColors = {
  paper: '#FBF7EE',
  paperStrong: '#F5EEDF',
  paperMuted: '#FFF8EE',
  surface: 'rgba(255, 249, 241, 0.82)',
  surfaceStrong: 'rgba(255, 252, 247, 0.90)',
  surfaceMuted: 'rgba(255, 246, 236, 0.74)',
  pearlIvory: 'rgba(255, 252, 247, 0.98)',
  pearlGlow: 'rgba(255, 255, 255, 0.84)',
  pearlSage: 'rgba(211, 224, 213, 0.58)',
  pearlPeach: 'rgba(240, 220, 208, 0.56)',
  pearlMist: 'rgba(223, 230, 241, 0.48)',
  grainShadow: 'rgba(123, 102, 79, 1)',
  grainHighlight: 'rgba(255, 255, 255, 1)',
  line: 'rgba(23, 32, 51, 0.10)',
  lineStrong: 'rgba(23, 32, 51, 0.18)',
  ink: '#172033',
  inkSoft: '#5E6472',
  accentBlue: '#24385D',
  accentGreen: '#1F6B4F',
  accentGreenSoft: 'rgba(31, 107, 79, 0.14)',
  accentAmber: '#AA6A13',
  accentAmberSoft: 'rgba(170, 106, 19, 0.15)',
  accentRed: '#B9463E',
  accentRedSoft: 'rgba(185, 70, 62, 0.14)',
  chip: '#FFF7EA',
  white: '#FFFFFF',
  black: '#000000',
} as const;

export const homeDashboardSpacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 28,
  xxxl: 32,
} as const;

export const homeDashboardRadii = {
  xs: 14,
  sm: 18,
  md: 22,
  lg: 24,
  xl: 30,
  pill: 999,
} as const;

export const homeDashboardTypography = {
  micro: 11,
  caption: 12,
  body: 14,
  bodyStrong: 15,
  section: 24,
  metric: 26,
  verdict: 56,
} as const;

export const homeDashboardShadows = {
  card: '0 12px 26px rgba(34, 29, 20, 0.10)',
  hero: '0 26px 60px rgba(34, 29, 20, 0.16)',
} as const;

export const homeDashboardSignalColors = {
  SAFE: {
    background: homeDashboardColors.accentGreenSoft,
    text: homeDashboardColors.accentGreen,
  },
  CAUTION: {
    background: homeDashboardColors.accentAmberSoft,
    text: homeDashboardColors.accentAmber,
  },
  DANGER: {
    background: homeDashboardColors.accentRedSoft,
    text: homeDashboardColors.accentRed,
  },
  EMPTY: {
    background: homeDashboardColors.surfaceMuted,
    text: homeDashboardColors.inkSoft,
  },
} as const;
