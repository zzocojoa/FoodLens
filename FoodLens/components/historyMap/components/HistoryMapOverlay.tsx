import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import {
    historyDashboardColors as colors,
    historyDashboardRadii as radii,
    historyDashboardSpacing as spacing,
    historyDashboardTypography as typography,
} from '../../../features/history/components/historyDashboardTokens';
import { useI18n } from '../../../features/i18n';

type HistoryMapOverlayProps = {
    isMapReady: boolean;
    countryCount: number;
    favoriteCountry: string;
    totalRecordCount: number;
    toastMessage: string | null;
};

export default function HistoryMapOverlay({
    isMapReady,
    countryCount,
    favoriteCountry,
    totalRecordCount,
    toastMessage,
}: HistoryMapOverlayProps): React.JSX.Element | null {
    const { t } = useI18n();
    const hasInsights = isMapReady && countryCount > 0;

    if (!hasInsights && !toastMessage) {
        return null;
    }

    const toastAlignment = isMapReady && countryCount > 0 ? styles.toastContainerBottom : styles.toastContainerCenter;
    const accessibilityLabel = toastMessage
        ? favoriteCountry.length > 0
            ? `${toastMessage} ${favoriteCountry}`
            : toastMessage
        : undefined;
    const favoriteLabel = favoriteCountry.length > 0
        ? favoriteCountry
        : t('history.atlas.noCountry', '없음');

    return (
        <View pointerEvents="box-none" style={styles.overlayRoot}>
            {hasInsights ? (
                <View pointerEvents="none" style={styles.insightContainer}>
                    <View style={styles.insightCard}>
                        <Text style={styles.insightEyebrow}>
                            {t('history.map.insights.title', '글로벌 인사이트')}
                        </Text>
                        <View style={styles.metricRow}>
                            <View style={styles.metricBlock}>
                                <Text style={styles.metricValue}>{countryCount}</Text>
                                <Text style={styles.metricLabel}>
                                    {t('history.atlas.metricCountries', '국가')}
                                </Text>
                            </View>
                            <View style={styles.metricDivider} />
                            <View style={styles.metricBlock}>
                                <Text style={styles.metricValue}>{totalRecordCount}</Text>
                                <Text style={styles.metricLabel}>
                                    {t('history.atlas.metricRecords', '기록')}
                                </Text>
                            </View>
                        </View>
                        <Text style={styles.favoriteLabel}>
                            {t('history.map.insights.favoriteDestination', '선호 여행지')}
                        </Text>
                        <Text style={styles.favoriteValue}>{favoriteLabel}</Text>
                    </View>
                </View>
            ) : null}

            {toastMessage ? (
                <View pointerEvents="box-none" style={[styles.toastContainer, toastAlignment]}>
                    <View accessibilityLabel={accessibilityLabel} style={styles.toast}>
                        <Text style={styles.toastText}>{toastMessage}</Text>
                    </View>
                </View>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    favoriteLabel: {
        color: colors.inkSoft,
        fontSize: typography.caption,
        fontWeight: '700',
        lineHeight: 14,
        marginTop: spacing.xs,
    },
    favoriteValue: {
        color: colors.ink,
        fontSize: typography.bodyStrong,
        fontWeight: '800',
        lineHeight: 20,
        marginTop: 2,
    },
    insightCard: {
        backgroundColor: 'rgba(251, 247, 238, 0.94)',
        borderColor: colors.line,
        borderCurve: 'continuous',
        borderRadius: radii.lg,
        borderWidth: 1,
        gap: spacing.xs,
        maxWidth: 220,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm + 2,
    },
    insightContainer: {
        left: spacing.md,
        position: 'absolute',
        top: spacing.md,
        zIndex: 30,
    },
    insightEyebrow: {
        color: colors.inkSoft,
        fontSize: typography.caption,
        fontWeight: '700',
        letterSpacing: 0.6,
        lineHeight: 14,
        textTransform: 'uppercase',
    },
    metricBlock: {
        flex: 1,
        gap: 2,
    },
    metricDivider: {
        backgroundColor: colors.line,
        height: '100%',
        opacity: 0.9,
        width: 1,
    },
    metricLabel: {
        color: colors.inkSoft,
        fontSize: typography.caption,
        fontWeight: '700',
        lineHeight: 14,
    },
    metricRow: {
        alignItems: 'stretch',
        flexDirection: 'row',
        gap: spacing.sm,
    },
    metricValue: {
        color: colors.ink,
        fontSize: typography.section,
        fontWeight: '800',
        lineHeight: 28,
    },
    overlayRoot: {
        ...StyleSheet.absoluteFillObject,
    },
    toast: {
        alignSelf: 'center',
        backgroundColor: 'rgba(251, 247, 238, 0.94)',
        borderColor: colors.line,
        borderCurve: 'continuous',
        borderRadius: radii.pill,
        borderWidth: 1,
        maxWidth: 320,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
    },
    toastContainer: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        paddingHorizontal: spacing.md,
    },
    toastContainerBottom: {
        justifyContent: 'flex-end',
        paddingBottom: spacing.md,
    },
    toastContainerCenter: {
        justifyContent: 'center',
    },
    toastText: {
        color: colors.inkSoft,
        fontSize: typography.caption,
        fontWeight: '700',
        lineHeight: 16,
        textAlign: 'center',
    },
});
