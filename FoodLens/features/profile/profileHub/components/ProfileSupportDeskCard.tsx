import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ChevronRight, Shield } from 'lucide-react-native';

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

type ProfileSupportDeskCardProps = {
    colorScheme: ColorSchemeName;
    onPress: () => void;
};

export default function ProfileSupportDeskCard({
    colorScheme,
    onPress,
}: ProfileSupportDeskCardProps): React.JSX.Element {
    const { t } = useI18n();
    const isDarkTheme = colorScheme === 'dark';

    return (
        <View style={styles.section}>
            <View style={styles.header}>
                <Text style={[styles.sectionTitle, isDarkTheme ? styles.sectionTitleDark : null]}>
                    {t('profileAtelier.support.title', 'Support Desk')}
                </Text>
            </View>

            <View style={[styles.group, isDarkTheme ? styles.groupDark : null]}>
                <HapticPressable
                    accessibilityLabel={t('profileAtelier.support.policies', 'Support & Policies')}
                    accessibilityRole="button"
                    hapticType="light"
                    onPress={onPress}
                    style={styles.rowButton}
                >
                    <View style={styles.rowLeading}>
                        <View style={[styles.iconTile, isDarkTheme ? styles.iconTileDark : null]}>
                            <Shield color={homeDashboardColors.accentBlue} size={16} />
                        </View>
                        <Text style={[styles.rowLabel, isDarkTheme ? styles.rowLabelDark : null]}>
                            {t('profileAtelier.support.policies', 'Support & Policies')}
                        </Text>
                    </View>
                    <ChevronRight
                        color={isDarkTheme ? 'rgba(255, 255, 255, 0.54)' : homeDashboardColors.inkSoft}
                        size={17}
                    />
                </HapticPressable>
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
        fontWeight: '700',
        lineHeight: 16,
        letterSpacing: 0.2,
    },
    sectionTitleDark: {
        color: 'rgba(255, 255, 255, 0.70)',
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
    rowLeading: {
        alignItems: 'center',
        columnGap: homeDashboardSpacing.sm,
        flex: 1,
        flexDirection: 'row',
        marginRight: homeDashboardSpacing.sm,
    },
    iconTile: {
        alignItems: 'center',
        backgroundColor: 'rgba(36, 56, 93, 0.12)',
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
});
