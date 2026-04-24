import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Globe } from 'lucide-react-native';

import { HapticPressable } from '@/components/HapticFeedback';
import type { ColorSchemeName } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import HomePearlSurfaceOverlay from '@/features/home/components/PearlSurfaceOverlay';
import { homeDashboardStyles } from '@/features/home/components/homeDashboardStyles';
import {
    homeDashboardColors,
    homeDashboardRadii,
    homeDashboardSpacing,
    homeDashboardTypography,
} from '@/features/home/components/homeDashboardTokens';
import { useI18n } from '@/features/i18n';

import AnimatedThemeToggle from './AnimatedThemeToggle';

type ProfileTravelModeSectionProps = {
    colorScheme: ColorSchemeName;
    appLanguageLabel: string;
    onPressAppLanguage: () => void;
};

type ProfileThemePreferenceRowProps = {
    colorScheme: ColorSchemeName;
};

function ProfileThemePreferenceRow({ colorScheme }: ProfileThemePreferenceRowProps): React.JSX.Element {
    const { t } = useI18n();
    const { theme: themePreference, setTheme } = useTheme();
    const isDarkTheme = colorScheme === 'dark';
    const currentThemeLabel =
        themePreference === 'light'
            ? t('profileHub.theme.light', 'Light')
            : themePreference === 'dark'
                ? t('profileHub.theme.dark', 'Dark')
                : t('profileHub.theme.system', 'System');

    return (
        <View style={[styles.themeRow, isDarkTheme ? styles.rowDividerDark : styles.rowDividerLight]}>
            <View style={styles.themeRowHeader}>
                <Text style={[styles.rowLabel, isDarkTheme ? styles.rowLabelDark : null]}>
                    {t('profileAtelier.travel.theme', 'Theme')}
                </Text>
                <Text style={[styles.rowDetail, isDarkTheme ? styles.rowDetailDark : null]}>
                    {currentThemeLabel}
                </Text>
            </View>

            <View style={styles.toggleWrap}>
                <AnimatedThemeToggle
                    colorScheme={colorScheme}
                    onChangeThemePreference={setTheme}
                    themePreference={themePreference}
                />
            </View>
        </View>
    );
}

const MemoizedProfileThemePreferenceRow = React.memo(ProfileThemePreferenceRow);

MemoizedProfileThemePreferenceRow.displayName = 'ProfileThemePreferenceRow';

function ProfileTravelModeSection({
    colorScheme,
    appLanguageLabel,
    onPressAppLanguage,
}: ProfileTravelModeSectionProps): React.JSX.Element {
    const { t } = useI18n();
    const isDarkTheme = colorScheme === 'dark';

    return (
        <View style={styles.section}>
            <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, isDarkTheme ? styles.sectionTitleDark : null]}>
                    {t('profileAtelier.travel.title', 'Travel Mode')}
                </Text>
            </View>

            <View
                style={[
                    homeDashboardStyles.sectionCard,
                    styles.groupCard,
                    isDarkTheme ? styles.groupCardDark : styles.groupCardLight,
                ]}
            >
                {isDarkTheme ? null : (
                    <HomePearlSurfaceOverlay
                        accentWashColor={homeDashboardColors.pearlMist}
                        baseBottomColor={homeDashboardColors.paperStrong}
                        baseTopColor={homeDashboardColors.pearlIvory}
                        coolWashColor={homeDashboardColors.pearlGlow}
                        warmWashColor={homeDashboardColors.pearlPeach}
                    />
                )}

                <View style={styles.groupContent}>
                    <MemoizedProfileThemePreferenceRow colorScheme={colorScheme} />

                    <HapticPressable
                        accessibilityRole="button"
                        hapticType="selection"
                        onPress={onPressAppLanguage}
                        style={styles.languageRow}
                    >
                        <View style={styles.languageLead}>
                            <View style={[styles.languageIconWrap, isDarkTheme ? styles.languageIconWrapDark : null]}>
                                <Globe
                                    color={isDarkTheme ? homeDashboardColors.pearlIvory : homeDashboardColors.accentBlue}
                                    size={16}
                                />
                            </View>

                            <View style={styles.languageCopy}>
                                <Text style={[styles.rowLabel, isDarkTheme ? styles.rowLabelDark : null]}>
                                    {t('profileAtelier.travel.appLanguage', 'App Language')}
                                </Text>
                                <Text
                                    numberOfLines={1}
                                    style={[styles.languageValue, isDarkTheme ? styles.languageValueDark : null]}
                                >
                                    {appLanguageLabel}
                                </Text>
                            </View>
                        </View>

                        <ChevronRight
                            color={isDarkTheme ? 'rgba(255, 255, 255, 0.54)' : homeDashboardColors.inkSoft}
                            size={18}
                        />
                    </HapticPressable>
                </View>
            </View>
        </View>
    );
}

const MemoizedProfileTravelModeSection = React.memo(ProfileTravelModeSection);

MemoizedProfileTravelModeSection.displayName = 'ProfileTravelModeSection';

export default MemoizedProfileTravelModeSection;

const styles = StyleSheet.create({
    section: {
        gap: homeDashboardSpacing.xs,
    },
    sectionHeader: {
        paddingHorizontal: 4,
    },
    sectionTitle: {
        color: homeDashboardColors.inkSoft,
        fontSize: homeDashboardTypography.caption,
        fontWeight: '800',
        letterSpacing: 0.7,
        lineHeight: 14,
        textTransform: 'uppercase',
    },
    sectionTitleDark: {
        color: 'rgba(255, 255, 255, 0.70)',
    },
    groupCard: {
        overflow: 'hidden',
        padding: 0,
        position: 'relative',
    },
    groupCardLight: {
        backgroundColor: 'rgba(255, 249, 241, 0.86)',
        borderColor: homeDashboardColors.line,
    },
    groupCardDark: {
        backgroundColor: 'rgba(12, 18, 30, 0.94)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
        boxShadow: '0 16px 30px rgba(2, 6, 23, 0.24)',
    },
    groupContent: {
        zIndex: 1,
    },
    themeRow: {
        gap: homeDashboardSpacing.sm,
        paddingHorizontal: homeDashboardSpacing.md,
        paddingVertical: 14,
    },
    themeRowHeader: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: homeDashboardSpacing.sm,
        justifyContent: 'space-between',
    },
    rowDividerLight: {
        borderBottomColor: homeDashboardColors.line,
        borderBottomWidth: 1,
    },
    rowDividerDark: {
        borderBottomColor: 'rgba(255, 255, 255, 0.08)',
        borderBottomWidth: 1,
    },
    rowLabel: {
        color: homeDashboardColors.ink,
        fontSize: homeDashboardTypography.bodyStrong,
        fontWeight: '700',
        lineHeight: 18,
    },
    rowLabelDark: {
        color: homeDashboardColors.pearlIvory,
    },
    rowDetail: {
        color: homeDashboardColors.inkSoft,
        fontSize: homeDashboardTypography.micro,
        fontWeight: '800',
        letterSpacing: 0.7,
        lineHeight: 13,
        textTransform: 'uppercase',
    },
    rowDetailDark: {
        color: 'rgba(255, 255, 255, 0.60)',
    },
    toggleWrap: {
        width: '100%',
    },
    languageRow: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: homeDashboardSpacing.sm,
        justifyContent: 'space-between',
        minHeight: 66,
        paddingHorizontal: homeDashboardSpacing.md,
        paddingVertical: 13,
    },
    languageLead: {
        alignItems: 'center',
        flexDirection: 'row',
        flex: 1,
        gap: homeDashboardSpacing.sm,
    },
    languageIconWrap: {
        alignItems: 'center',
        backgroundColor: 'rgba(36, 56, 93, 0.10)',
        borderRadius: homeDashboardRadii.pill,
        height: 32,
        justifyContent: 'center',
        width: 32,
    },
    languageIconWrapDark: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    languageCopy: {
        flex: 1,
        gap: 2,
    },
    languageValue: {
        color: homeDashboardColors.inkSoft,
        fontSize: homeDashboardTypography.body,
        fontWeight: '800',
        lineHeight: 18,
    },
    languageValueDark: {
        color: 'rgba(255, 255, 255, 0.72)',
    },
});
