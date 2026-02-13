import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Globe } from 'lucide-react-native';
import { historyMapStyles as styles } from '../styles';

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
    const isPermissionError = errorType === 'permission';
    const errorTitle = isPermissionError ? '위치 권한이 필요합니다' : 'Map Unavailable';
    const errorDescription = isPermissionError
        ? '지도에서 음식 기록을 보려면\n위치 서비스를 허용해주세요.'
        : '네트워크 연결을 확인해주세요.';

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
                                <Text style={styles.settingsButtonText}>설정으로 이동</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={onRetry} style={[styles.errorButton, styles.retryButton]}>
                                <Text style={styles.retryButtonText}>RETRY</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {!isMapReady && !isMapError && (
                <View style={[StyleSheet.absoluteFill, styles.loadingOverlay]}>
                    <Text style={styles.loadingEmoji}>🗺️</Text>
                    <Text style={styles.loadingText}>Loading Map...</Text>
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
                            {filterText || 'No trips yet'}
                        </Text>
                    </View>
                </View>
            )}
        </>
    );
}
