import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Linking } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import MapViewClustering from 'react-native-map-clustering';
import { BlurView } from 'expo-blur';
import { Globe } from 'lucide-react-native';
import { THEME } from '../constants/theme';
import { CountryData } from '../models/History';
import * as Location from 'expo-location';

interface HistoryMapProps {
    data: CountryData[];
    initialRegion: Region | null;
    onMarkerPress: (countryId: string) => void;
    onReady?: () => void;
    onRegionChange?: (region: Region) => void;
}

const INITIAL_REGION: Region = {
    latitude: 20,
    longitude: 0,
    latitudeDelta: 50,
    longitudeDelta: 50,
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TOTAL_COUNTRIES = 195;

const parseCoordinateValue = (value: number | string | undefined) =>
    typeof value === 'string' ? Number(value) : value;

export default function HistoryMap({ data, initialRegion, onMarkerPress, onReady, onRegionChange }: HistoryMapProps) {
    const mapRef = useRef<MapView>(null);

    const [isMapReady, setIsMapReady] = useState(false);
    const [isMapError, setIsMapError] = useState(false);
    const [errorType, setErrorType] = useState<'timeout' | 'permission' | null>(null);
    const [mapReloadKey, setMapReloadKey] = useState(0);

    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [didFitOnce, setDidFitOnce] = useState(false);

    // Flatten data to markers (lightweight — no image URIs to reduce memory)
    const markers = useMemo(() => {
        const _markers: any[] = [];
        data.forEach((country: any, countryIdx: number) => {
            (country?.regions || []).forEach((r: any) => {
                (r?.items || []).forEach((item: any) => {
                    const loc = item?.originalRecord?.location;

                    const latRaw = loc?.latitude;
                    const lngRaw = loc?.longitude;

                    const lat = parseCoordinateValue(latRaw);
                    const lng = parseCoordinateValue(lngRaw);

                    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
                    if (lat === 0 && lng === 0) return;

                    _markers.push({
                        id: item.id,
                        coordinate: { latitude: lat, longitude: lng },
                        countryId: `${country.country}-${countryIdx}`,
                        emoji: item.emoji,
                        name: item.name,
                    });
                });
            });
        });
        return _markers;
    }, [data]);

    // Memoize favorite country for overlay card (avoid re-sorting on every render)
    const favoriteCountry = useMemo(() =>
        [...data].sort((a: any, b: any) => (b.total ?? 0) - (a.total ?? 0))[0]?.country || '-',
        [data]
    );

    // Auto-fit to markers on initial load
    useEffect(() => {
        if (!isMapReady) return;
        if (!mapRef.current) return;
        if (didFitOnce) return;
        if (markers.length === 0) return;

        const coords = markers.map((m: any) => m.coordinate);

        mapRef.current.fitToCoordinates(coords, {
            edgePadding: { top: 90, right: 60, bottom: 220, left: 60 },
            animated: true,
        });

        setDidFitOnce(true);
    }, [isMapReady, markers.length, didFitOnce]);

    // Timeout watchdog with permission check
    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout>;

        const checkPermissionAndTimeout = async () => {
            const { status } = await Location.getForegroundPermissionsAsync();

            if (status === 'denied') {
                setIsMapError(true);
                setErrorType('permission');
                return;
            }

            if (!isMapReady && !isMapError) {
                timeout = setTimeout(() => {
                    if (!isMapReady) {
                        setIsMapError(true);
                        setErrorType('timeout');
                    }
                }, 10000);
            }
        };

        checkPermissionAndTimeout();

        return () => clearTimeout(timeout);
    }, [isMapReady, isMapError]);

    const handleRetry = () => {
        setIsMapError(false);
        setErrorType(null);
        setIsMapReady(false);
        setDidFitOnce(false);
        setMapReloadKey(prev => prev + 1);
    };

    const handleOpenSettings = () => {
        Linking.openSettings();
    };

    // Toast auto-dismiss
    useEffect(() => {
        if (toastMessage) {
            const timer = setTimeout(() => setToastMessage(null), 2000);
            return () => clearTimeout(timer);
        }
    }, [toastMessage]);

    const handleRegionChangeComplete = (r: Region) => {
        onRegionChange?.(r);
    };

    const isPermissionError = errorType === 'permission';
    const errorTitle = isPermissionError ? '위치 권한이 필요합니다' : 'Map Unavailable';
    const errorDescription = isPermissionError
        ? '지도에서 음식 기록을 보려면\n위치 서비스를 허용해주세요.'
        : '네트워크 연결을 확인해주세요.';

    // Custom cluster rendering — lightweight, no Image/BlurView, stable callback
    const renderCluster = useCallback((cluster: any) => {
        const { id, geometry, onPress, properties } = cluster;
        const points = properties.point_count;

        return (
            <Marker
                key={`cluster-${id}`}
                coordinate={{
                    latitude: geometry.coordinates[1],
                    longitude: geometry.coordinates[0],
                }}
                onPress={onPress}
                anchor={{ x: 0.5, y: 0.5 }}
                tracksViewChanges={false}
            >
                <View style={styles.clusterContainer}>
                    <View style={styles.clusterCircle}>
                        <Text style={styles.clusterEmoji}>📍</Text>
                    </View>
                    <View style={styles.clusterBadge}>
                        <Text style={styles.clusterCountText}>{points}</Text>
                    </View>
                </View>
            </Marker>
        );
    }, []);

    return (
        <View style={styles.mapContainer}>
            {/* Error State */}
            {isMapError && (
                <View style={[StyleSheet.absoluteFill, styles.errorOverlay]}>
                    <View style={styles.errorContent}>
                        <Globe size={48} color="#94A3B8" />
                        <Text style={styles.errorTitle}>
                            {errorTitle}
                        </Text>
                        <Text style={styles.errorDescription}>
                            {errorDescription}
                        </Text>
                        {isPermissionError ? (
                            <TouchableOpacity onPress={handleOpenSettings} style={[styles.errorButton, styles.settingsButton]}>
                                <Text style={styles.settingsButtonText}>설정으로 이동</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={handleRetry} style={[styles.errorButton, styles.retryButton]}>
                                <Text style={styles.retryButtonText}>RETRY</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            )}

            {/* Loading State */}
            {!isMapReady && !isMapError && (
                <View style={[StyleSheet.absoluteFill, styles.loadingOverlay]}>
                    <Text style={styles.loadingEmoji}>🗺️</Text>
                    <Text style={styles.loadingText}>Loading Map...</Text>
                </View>
            )}

            {/* Empty State */}
            {isMapReady && markers.length === 0 && (
                <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', zIndex: 5, pointerEvents: 'none' }]}>
                    <BlurView intensity={40} tint="light" style={{ padding: 20, borderRadius: 20, overflow: 'hidden', alignItems: 'center' }}>
                        <Text style={{ fontSize: 32 }}>🌏</Text>
                        <Text style={{ marginTop: 8, color: '#475569', fontWeight: '600' }}>No trips yet</Text>
                    </BlurView>
                </View>
            )}

            <MapViewClustering
                key={mapReloadKey}
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_DEFAULT}
                initialRegion={initialRegion || INITIAL_REGION}
                onMapReady={() => {
                    setIsMapReady(true);
                    onReady?.();
                }}
                onRegionChangeComplete={handleRegionChangeComplete}
                clusterColor="#2563EB"
                clusterTextColor="#FFFFFF"
                clusterFontFamily="System"
                radius={SCREEN_WIDTH * 0.06}
                maxZoom={20}
                minZoom={0}
                extent={512}
                nodeSize={64}
                renderCluster={renderCluster}
                tracksViewChanges={false}
                spiralEnabled={false}
            >
                {markers.map((marker: any) => (
                    <Marker
                        key={`pin-${marker.id}`}
                        coordinate={marker.coordinate}
                        anchor={{ x: 0.5, y: 1 }}
                        tracksViewChanges={false}
                        onPress={() => onMarkerPress(marker.countryId)}
                    >
                        <TouchableOpacity activeOpacity={0.9} style={styles.mapPinContainer}>
                            <View pointerEvents="none">
                                <View style={styles.mapLabel}>
                                    <Text style={styles.mapLabelText} numberOfLines={1} ellipsizeMode="tail">
                                        {marker.name}
                                    </Text>
                                </View>
                                <View style={styles.mapPinCircle}>
                                    <Text style={styles.mapPinEmoji}>{marker.emoji}</Text>
                                </View>
                            </View>
                        </TouchableOpacity>
                    </Marker>
                ))}
            </MapViewClustering>

            {/* Overlay Card */}
            {isMapReady && data.length > 0 && (() => {
                const visitedCount = data.length;
                const percentage = Math.min((visitedCount / TOTAL_COUNTRIES) * 100, 100);

                return (
                    <View style={[styles.mapOverlay, THEME.shadow]}>
                        <BlurView intensity={90} tint="light" style={[styles.insightCard, THEME.glass]}>
                            <View style={styles.insightHeader}>
                                <View style={styles.insightIconBox}>
                                    <Globe size={16} color="#2563EB" />
                                </View>
                                <Text style={styles.insightTitle}>Global Insights</Text>
                            </View>
                            <View style={styles.insightRow}>
                                <Text style={styles.insightLabel}>Favorite Destination</Text>
                                <Text style={styles.insightValue}>
                                    {favoriteCountry}
                                </Text>
                            </View>
                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBarFill, { width: `${percentage}%` }]} />
                            </View>
                            <Text style={styles.insightHint}>Visited {visitedCount} of {TOTAL_COUNTRIES} countries</Text>
                        </BlurView>
                    </View>
                );
            })()}

            {/* Toast Message */}
            {toastMessage && (
                <View style={styles.toastContainer}>
                    <BlurView intensity={80} tint="dark" style={styles.toast}>
                        <Text style={styles.toastText}>{toastMessage}</Text>
                    </BlurView>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    mapContainer: { flex: 1, overflow: 'hidden', marginHorizontal: 20, marginBottom: 20, borderRadius: 32, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F1F5F9' },
    map: { width: '100%', height: '100%' },
    errorOverlay: { backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
    errorContent: { alignItems: 'center', opacity: 0.7, paddingHorizontal: 40 },
    errorTitle: { marginTop: 12, color: '#64748B', fontWeight: '600', textAlign: 'center' },
    errorDescription: { marginTop: 8, color: '#94A3B8', fontSize: 12, textAlign: 'center' },
    errorButton: { marginTop: 16, borderRadius: 20 },
    settingsButton: { paddingHorizontal: 20, paddingVertical: 10, backgroundColor: '#2563EB' },
    settingsButtonText: { fontSize: 13, fontWeight: '700', color: '#FFFFFF' },
    retryButton: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#E2E8F0' },
    retryButtonText: { fontSize: 12, fontWeight: '700', color: '#475569' },
    loadingOverlay: { backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    loadingEmoji: { fontSize: 24, marginBottom: 12 },
    loadingText: { color: '#64748B', fontSize: 12, fontWeight: '600' },
    mapPinContainer: { alignItems: 'center' },
    mapLabel: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', marginBottom: 4, backgroundColor: 'rgba(255,255,255,0.85)' },
    mapLabelText: { fontSize: 10, fontWeight: '700', color: '#1E293B', maxWidth: 100 },
    mapPinCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
    mapPinEmoji: { fontSize: 16 },

    clusterContainer: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    clusterCircle: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#FFFFFF', backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
    clusterEmoji: { fontSize: 18 },
    clusterBadge: { position: 'absolute', top: -4, right: -4, backgroundColor: '#2563EB', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: 'white' },
    clusterCountText: { color: 'white', fontSize: 10, fontWeight: '700' },

    mapOverlay: { position: 'absolute', bottom: 20, left: 20, right: 20, borderRadius: 32 },
    insightCard: { padding: 20, borderRadius: 32, overflow: 'hidden' },
    insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16 },
    insightIconBox: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
    insightTitle: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
    insightRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    insightLabel: { fontSize: 13, color: '#64748B', fontWeight: '500' },
    insightValue: { fontSize: 14, fontWeight: '700', color: '#0F172A' },
    progressBarBg: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 3, marginBottom: 12, overflow: 'hidden' },
    progressBarFill: { height: '100%', backgroundColor: '#2563EB', borderRadius: 3 },
    insightHint: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 4 },

    toastContainer: { position: 'absolute', top: 20, left: 0, right: 0, alignItems: 'center', zIndex: 100 },
    toast: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, overflow: 'hidden' },
    toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' }
});
