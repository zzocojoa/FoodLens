import {
    homeDashboardColors,
    getHomeDashboardColors,
    homeDashboardRadii,
    homeDashboardShadows,
    homeDashboardSpacing,
    homeDashboardTypography,
    type HomeDashboardColorScheme,
    type HomeDashboardColors,
} from '../../home/components/homeDashboardTokens';

export type AllergiesDashboardTone = 'neutral' | 'safe' | 'caution' | 'danger' | 'accent';

export const allergiesDashboardColors = homeDashboardColors;

export const getAllergiesDashboardColors = getHomeDashboardColors;

export type AllergiesDashboardColorScheme = HomeDashboardColorScheme;

export type AllergiesDashboardColors = HomeDashboardColors;

export const allergiesDashboardSpacing = homeDashboardSpacing;

export const allergiesDashboardRadii = homeDashboardRadii;

export const allergiesDashboardTypography = homeDashboardTypography;

export const allergiesDashboardShadows = homeDashboardShadows;

export type AllergiesDashboardToneTokens = {
    backgroundColor: string;
    borderColor: string;
    textColor: string;
};

export const allergiesDashboardToneTokens: Record<AllergiesDashboardTone, AllergiesDashboardToneTokens> = {
    neutral: {
        backgroundColor: homeDashboardColors.surfaceMuted,
        borderColor: homeDashboardColors.line,
        textColor: homeDashboardColors.inkSoft,
    },
    safe: {
        backgroundColor: homeDashboardColors.accentGreenSoft,
        borderColor: homeDashboardColors.accentGreen,
        textColor: homeDashboardColors.accentGreen,
    },
    caution: {
        backgroundColor: homeDashboardColors.accentAmberSoft,
        borderColor: homeDashboardColors.accentAmber,
        textColor: homeDashboardColors.accentAmber,
    },
    danger: {
        backgroundColor: homeDashboardColors.accentRedSoft,
        borderColor: homeDashboardColors.accentRed,
        textColor: homeDashboardColors.accentRed,
    },
    accent: {
        backgroundColor: homeDashboardColors.pearlMist,
        borderColor: homeDashboardColors.lineStrong,
        textColor: homeDashboardColors.accentBlue,
    },
};

export const getAllergiesDashboardToneTokens = (
    colors: AllergiesDashboardColors,
    tone: AllergiesDashboardTone,
): AllergiesDashboardToneTokens => ({
    neutral: {
        backgroundColor: colors.surfaceMuted,
        borderColor: colors.line,
        textColor: colors.inkSoft,
    },
    safe: {
        backgroundColor: colors.accentGreenSoft,
        borderColor: colors.accentGreen,
        textColor: colors.accentGreen,
    },
    caution: {
        backgroundColor: colors.accentAmberSoft,
        borderColor: colors.accentAmber,
        textColor: colors.accentAmber,
    },
    danger: {
        backgroundColor: colors.accentRedSoft,
        borderColor: colors.accentRed,
        textColor: colors.accentRed,
    },
    accent: {
        backgroundColor: colors.pearlMist,
        borderColor: colors.lineStrong,
        textColor: colors.accentBlue,
    },
}[tone]);
