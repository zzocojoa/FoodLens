import {
    homeDashboardColors,
    homeDashboardRadii,
    homeDashboardShadows,
    homeDashboardSpacing,
    homeDashboardTypography,
} from '../../home/components/homeDashboardTokens';

export type AllergiesDashboardTone = 'neutral' | 'safe' | 'caution' | 'danger' | 'accent';

export const allergiesDashboardColors = homeDashboardColors;

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
    tone: AllergiesDashboardTone,
): AllergiesDashboardToneTokens => {
    return allergiesDashboardToneTokens[tone];
};
