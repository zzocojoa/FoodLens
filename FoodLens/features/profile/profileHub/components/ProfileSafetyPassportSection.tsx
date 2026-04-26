import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Globe, Shield } from 'lucide-react-native';

import { HapticPressable } from '@/components/HapticFeedback';
import type { ColorSchemeName } from '@/constants/theme';
import {
    homeDashboardColors,
    homeDashboardRadii,
    homeDashboardShadows,
    homeDashboardSpacing,
    homeDashboardTypography,
} from '@/features/home/components/homeDashboardTokens';
import { useI18n } from '@/features/i18n';

type HapticType = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' | 'selection';

type ProfileSafetyPassportSectionProps = {
    colorScheme: ColorSchemeName;
    languageLabel: string;
    onPressHealthProfile: () => void;
    onPressTravelerLanguage: () => void;
};

type SafetyActionRowProps = {
    accessibilityLabel: string;
    accessibilityValueText?: string;
    icon: React.JSX.Element;
    label: string;
    onPress: () => void;
    value?: string;
    withDivider: boolean;
    hapticType: HapticType;
    colorScheme: ColorSchemeName;
};

const SafetyActionRow = ({
    accessibilityLabel,
    accessibilityValueText,
    icon,
    label,
    onPress,
    value,
    withDivider,
    hapticType,
    colorScheme,
}: SafetyActionRowProps): React.JSX.Element => {
    const isDarkTheme = colorScheme === 'dark';

    return (
        <HapticPressable
            accessibilityLabel={accessibilityLabel}
            accessibilityRole="button"
            accessibilityValue={
                typeof accessibilityValueText === 'string' ? { text: accessibilityValueText } : undefined
            }
            hapticType={hapticType}
            onPress={onPress}
            style={[
                styles.rowButton,
                withDivider ? (isDarkTheme ? styles.rowDividerDark : styles.rowDivider) : null,
            ]}
        >
            <View style={styles.rowLeading}>
                <View style={[styles.iconTile, isDarkTheme ? styles.iconTileDark : null]}>{icon}</View>
                <Text style={[styles.rowLabel, isDarkTheme ? styles.rowLabelDark : null]}>{label}</Text>
            </View>

            <View style={styles.rowTrailing}>
                {typeof value === 'string' ? (
                    <Text numberOfLines={1} style={[styles.rowValue, isDarkTheme ? styles.rowValueDark : null]}>
                        {value}
                    </Text>
                ) : null}
                <ChevronRight
                    color={isDarkTheme ? 'rgba(255, 255, 255, 0.54)' : homeDashboardColors.inkSoft}
                    size={17}
                />
            </View>
        </HapticPressable>
    );
};

export default function ProfileSafetyPassportSection({
    colorScheme,
    languageLabel,
    onPressHealthProfile,
    onPressTravelerLanguage,
}: ProfileSafetyPassportSectionProps): React.JSX.Element {
    const { t } = useI18n();
    const isDarkTheme = colorScheme === 'dark';

    return (
        <View style={styles.section}>
            <View style={styles.header}>
                <Text style={[styles.sectionTitle, isDarkTheme ? styles.sectionTitleDark : null]}>
                    {t('profileAtelier.safety.title', 'Safety Passport')}
                </Text>
                <Text style={[styles.sectionSummary, isDarkTheme ? styles.sectionSummaryDark : null]}>
                    {t('profileAtelier.safety.summary', 'Scan rules and travel card settings')}
                </Text>
            </View>

            <View style={[styles.group, isDarkTheme ? styles.groupDark : null]}>
                <SafetyActionRow
                    accessibilityLabel={t('profileAtelier.safety.healthProfile', 'Health Profile')}
                    accessibilityValueText={t('profileAtelier.safety.healthProfileValue', 'Allergies and restrictions')}
                    colorScheme={colorScheme}
                    hapticType="light"
                    icon={<Shield color={homeDashboardColors.accentGreen} size={16} />}
                    label={t('profileAtelier.safety.healthProfile', 'Health Profile')}
                    onPress={onPressHealthProfile}
                    withDivider={false}
                />
                <SafetyActionRow
                    accessibilityLabel={t('profileAtelier.safety.cardLanguage', 'Card Language')}
                    accessibilityValueText={languageLabel}
                    colorScheme={colorScheme}
                    hapticType="selection"
                    icon={<Globe color={homeDashboardColors.accentGreen} size={16} />}
                    label={t('profileAtelier.safety.cardLanguage', 'Card Language')}
                    onPress={onPressTravelerLanguage}
                    value={languageLabel}
                    withDivider
                />
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    section: {
        gap: homeDashboardSpacing.xs,
    },
    header: {
        paddingHorizontal: 2,
    },
    sectionTitle: {
        color: homeDashboardColors.inkSoft,
        fontSize: homeDashboardTypography.caption,
        fontWeight: '800',
        lineHeight: 14,
        letterSpacing: 0.7,
        textTransform: 'uppercase',
    },
    sectionTitleDark: {
        color: 'rgba(255, 255, 255, 0.70)',
    },
    sectionSummary: {
        color: homeDashboardColors.ink,
        fontSize: homeDashboardTypography.bodyStrong,
        fontWeight: '700',
        lineHeight: 20,
        marginTop: 3,
    },
    sectionSummaryDark: {
        color: homeDashboardColors.pearlIvory,
    },
    group: {
        backgroundColor: homeDashboardColors.surfaceStrong,
        borderColor: homeDashboardColors.line,
        borderCurve: 'continuous',
        borderRadius: homeDashboardRadii.lg,
        borderWidth: 1,
        boxShadow: homeDashboardShadows.card,
        overflow: 'hidden',
    },
    groupDark: {
        backgroundColor: 'rgba(12, 18, 30, 0.94)',
        borderColor: 'rgba(255, 255, 255, 0.10)',
        boxShadow: '0 16px 30px rgba(2, 6, 23, 0.24)',
    },
    rowButton: {
        alignItems: 'center',
        backgroundColor: 'transparent',
        flexDirection: 'row',
        justifyContent: 'space-between',
        minHeight: 54,
        paddingHorizontal: 14,
        paddingVertical: 12,
    },
    rowDivider: {
        borderTopColor: homeDashboardColors.line,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    rowDividerDark: {
        borderTopColor: 'rgba(255, 255, 255, 0.08)',
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    rowLeading: {
        alignItems: 'center',
        columnGap: homeDashboardSpacing.sm,
        flex: 1,
        flexDirection: 'row',
        marginRight: homeDashboardSpacing.sm,
    },
    rowTrailing: {
        alignItems: 'center',
        columnGap: homeDashboardSpacing.xs,
        flexDirection: 'row',
        flexShrink: 1,
        justifyContent: 'flex-end',
        minWidth: 0,
    },
    iconTile: {
        alignItems: 'center',
        backgroundColor: homeDashboardColors.accentGreenSoft,
        borderRadius: homeDashboardRadii.xs,
        height: 30,
        justifyContent: 'center',
        width: 30,
    },
    iconTileDark: {
        backgroundColor: 'rgba(255, 255, 255, 0.08)',
    },
    rowLabel: {
        color: homeDashboardColors.ink,
        flex: 1,
        fontSize: homeDashboardTypography.body,
        fontWeight: '600',
        lineHeight: 18,
    },
    rowLabelDark: {
        color: homeDashboardColors.pearlIvory,
    },
    rowValue: {
        color: homeDashboardColors.inkSoft,
        flexShrink: 1,
        fontSize: homeDashboardTypography.body,
        fontWeight: '500',
        lineHeight: 18,
        maxWidth: 120,
        textAlign: 'right',
    },
    rowValueDark: {
        color: 'rgba(255, 255, 255, 0.72)',
    },
});
