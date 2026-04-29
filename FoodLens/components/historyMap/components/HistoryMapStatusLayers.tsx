import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Globe } from 'lucide-react-native';
import { historyMapStyles as styles } from '../styles';
import { useI18n } from '@/features/i18n';
import {
    getHistoryDashboardAccentForegroundColor,
    type HistoryDashboardColors,
} from '@/features/history/components/historyDashboardTokens';

const localStyles = StyleSheet.create({
    emptyStateContainer: {
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 5,
        pointerEvents: 'none',
    },
    emptyStateCard: {
        padding: 20,
        borderRadius: 20,
        alignItems: 'center',
    },
    emptyStateIcon: {
        fontSize: 32,
    },
    emptyStateText: {
        marginTop: 8,
        fontWeight: '600',
    },
});

type HistoryMapStatusLayersProps = {
    colors: HistoryDashboardColors;
    isMapError: boolean;
    isMapReady: boolean;
    markersLength: number;
    errorType: 'timeout' | 'permission' | null;
    filterText?: string;
    onRetry: () => void;
    onOpenSettings: () => void;
};

export default function HistoryMapStatusLayers({
    colors,
    isMapError,
    isMapReady,
    markersLength,
    errorType,
    filterText,
    onRetry,
    onOpenSettings,
}: HistoryMapStatusLayersProps) {
    const { t } = useI18n();
    const isPermissionError = errorType === 'permission';
    const errorTitle = isPermissionError
        ? t('history.map.permissionRequiredTitle', 'Location permission is required')
        : t('history.map.unavailableTitle', 'Map unavailable');
    const errorDescription = isPermissionError
        ? t('history.map.permissionRequiredMessage', 'Allow location services to view food records on the map.')
        : t('history.map.networkRequiredMessage', 'Please check your network connection.');
    const accentForegroundColor = getHistoryDashboardAccentForegroundColor(colors);

    return (
        <>
            {isMapError && (
                <View style={[StyleSheet.absoluteFill, styles.errorOverlay, { backgroundColor: colors.paperStrong }]}>
                    <View style={styles.errorContent}>
                        <Globe size={48} color={colors.inkSoft} />
                        <Text style={[styles.errorTitle, { color: colors.inkSoft }]}>{errorTitle}</Text>
                        <Text style={[styles.errorDescription, { color: colors.inkSoft }]}>{errorDescription}</Text>
                        {isPermissionError ? (
                            <TouchableOpacity onPress={onOpenSettings} style={[styles.errorButton, styles.settingsButton, { backgroundColor: colors.accentBlue }]}>
                                <Text style={[styles.settingsButtonText, { color: accentForegroundColor }]}>{t('history.map.openSettings', 'Open Settings')}</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={onRetry} style={[styles.errorButton, styles.retryButton, { backgroundColor: colors.surfaceMuted }]}>
                                <Text style={[styles.retryButtonText, { color: colors.ink }]}>{t('common.retry', 'Retry')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {!isMapReady && !isMapError && (
                <View style={[StyleSheet.absoluteFill, styles.loadingOverlay, { backgroundColor: colors.paperStrong }]}>
                    <Text style={styles.loadingEmoji}>🗺️</Text>
                    <Text style={[styles.loadingText, { color: colors.inkSoft }]}>{t('history.map.loading', 'Loading Map...')}</Text>
                </View>
            )}

            {isMapReady && markersLength === 0 && (
                <View
                    style={[
                        StyleSheet.absoluteFill,
                        localStyles.emptyStateContainer,
                    ]}
                >
                    <View style={[localStyles.emptyStateCard, { backgroundColor: colors.surfaceStrong }]}>
                        <Text style={localStyles.emptyStateIcon}>🌏</Text>
                        <Text style={[localStyles.emptyStateText, { color: colors.inkSoft }]}>
                            {filterText || t('history.map.emptyTrips', 'No trips yet')}
                        </Text>
                    </View>
                </View>
            )}
        </>
    );
}
