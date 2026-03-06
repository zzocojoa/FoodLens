import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Globe } from 'lucide-react-native';
import { historyMapStyles as styles } from '../styles';
import { useI18n } from '@/features/i18n';

const GLOBE_COLOR = '#94A3B8';
const EMPTY_HINT_COLOR = '#475569';

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
        backgroundColor: 'rgba(255,255,255,0.85)',
        alignItems: 'center',
    },
    emptyStateIcon: {
        fontSize: 32,
    },
    emptyStateText: {
        marginTop: 8,
        color: EMPTY_HINT_COLOR,
        fontWeight: '600',
    },
});

type HistoryMapStatusLayersProps = {
    isMapError: boolean;
    isMapReady: boolean;
    markersLength: number;
    errorType: 'timeout' | 'permission' | null;
    filterText?: string;
    onRetry: () => void;
    onOpenSettings: () => void;
};

export default function HistoryMapStatusLayers({
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

    return (
        <>
            {isMapError && (
                <View style={[StyleSheet.absoluteFill, styles.errorOverlay]}>
                    <View style={styles.errorContent}>
                        <Globe size={48} color={GLOBE_COLOR} />
                        <Text style={styles.errorTitle}>{errorTitle}</Text>
                        <Text style={styles.errorDescription}>{errorDescription}</Text>
                        {isPermissionError ? (
                            <TouchableOpacity onPress={onOpenSettings} style={[styles.errorButton, styles.settingsButton]}>
                                <Text style={styles.settingsButtonText}>{t('history.map.openSettings', 'Open Settings')}</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={onRetry} style={[styles.errorButton, styles.retryButton]}>
                                <Text style={styles.retryButtonText}>{t('common.retry', 'Retry')}</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {!isMapReady && !isMapError && (
                <View style={[StyleSheet.absoluteFill, styles.loadingOverlay]}>
                    <Text style={styles.loadingEmoji}>🗺️</Text>
                    <Text style={styles.loadingText}>{t('history.map.loading', 'Loading Map...')}</Text>
                </View>
            )}

            {isMapReady && markersLength === 0 && (
                <View
                    style={[
                        StyleSheet.absoluteFill,
                        localStyles.emptyStateContainer,
                    ]}
                >
                    <View style={localStyles.emptyStateCard}>
                        <Text style={localStyles.emptyStateIcon}>🌏</Text>
                        <Text style={localStyles.emptyStateText}>
                            {filterText || t('history.map.emptyTrips', 'No trips yet')}
                        </Text>
                    </View>
                </View>
            )}
        </>
    );
}
