import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import { Globe } from 'lucide-react-native';
import { THEME } from '../constants/theme';
import { CountryData } from '../models/History';
import * as Location from 'expo-location';
import Supercluster from 'supercluster';

const ENABLE_MAP_DEBUG_LOGS = false;
const ENABLE_MAP_CLUSTERING = false;
const ENABLE_QA_MAP_METRICS = false;
const IOS_REGION_UPDATE_DEBOUNCE_MS = 350;
const ANDROID_REGION_UPDATE_DEBOUNCE_MS = 250;
const MAX_RENDER_MARKERS = 500;
const CLUSTER_RADIUS = 60;
const CLUSTER_MAX_ZOOM = 20;
const CLUSTER_MIN_ZOOM = 1;
const REGION_UPDATE_DEBOUNCE_MS =
    Platform.OS === 'ios' ? IOS_REGION_UPDATE_DEBOUNCE_MS : ANDROID_REGION_UPDATE_DEBOUNCE_MS;

const debugLog = (...args: any[]) => {
    if (ENABLE_MAP_DEBUG_LOGS) {
        console.log(...args);
    }
};

const metricsLog = (...args: any[]) => {
    if (ENABLE_QA_MAP_METRICS && __DEV__) {
        console.log(...args);
    }
};

interface HistoryMapProps {
    data: CountryData[];
    initialRegion: Region | null;
    onMarkerPress: (countryId: string) => void;
    onReady?: () => void;
    onRegionChange?: (region: Region) => void;
}

type MapMarker = {
    id: string;
    coordinate: { latitude: number; longitude: number };
    countryId: string;
    emoji: string;
    name: string;
};

type PointFeature = {
    type: 'Feature';
    geometry: {
        type: 'Point';
        coordinates: [number, number];
    };
    properties: {
        markerIndex: number;
    };
};

type ClusterFeature = {
    type: 'Feature';
    geometry: {
        type: 'Point';
        coordinates: [number, number];
    };
    properties: {
        cluster: true;
        cluster_id: number;
        point_count: number;
        point_count_abbreviated: string | number;
    };
};

type ClusterOrPoint = ClusterFeature | PointFeature;

const isClusterFeature = (item: ClusterOrPoint): item is ClusterFeature =>
    (item as ClusterFeature).properties.cluster === true;

const INITIAL_REGION: Region = {
    latitude: 20,
    longitude: 0,
    latitudeDelta: 50,
    longitudeDelta: 50,
};

const TOTAL_COUNTRIES = 195;

const parseCoordinateValue = (value: number | string | undefined) =>
    typeof value === 'string' ? Number(value) : value;

const isValidLatitude = (value: number) => Number.isFinite(value) && value >= -90 && value <= 90;
const isValidLongitude = (value: number) => Number.isFinite(value) && value >= -180 && value <= 180;
const isValidDelta = (value: number) => Number.isFinite(value) && value > 0 && value <= 360;

const buildRegionKey = (region: Region) =>
    `${region.latitude.toFixed(3)}:${region.longitude.toFixed(3)}:${region.latitudeDelta.toFixed(3)}:${region.longitudeDelta.toFixed(3)}`;

const toBoundingBox = (region: Region): [number, number, number, number] => {
    const lngDelta = region.longitudeDelta < 0 ? region.longitudeDelta + 360 : region.longitudeDelta;
    return [
        region.longitude - lngDelta,
        region.latitude - region.latitudeDelta,
        region.longitude + lngDelta,
        region.latitude + region.latitudeDelta,
    ];
};

const toApproxZoom = (region: Region): number => {
    if (!Number.isFinite(region.longitudeDelta) || region.longitudeDelta <= 0) return CLUSTER_MIN_ZOOM;
    const zoom = Math.log2(360 / region.longitudeDelta);
    return Math.max(CLUSTER_MIN_ZOOM, Math.min(CLUSTER_MAX_ZOOM, Math.floor(zoom)));
};

export default function HistoryMap({ data, initialRegion, onMarkerPress, onReady, onRegionChange }: HistoryMapProps) {
    const mapRef = useRef<MapView>(null);
    const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastRegionKeyRef = useRef<string | null>(null);
    const metricsWindowStartRef = useRef<number>(Date.now());
    const metricsRegionEventCountRef = useRef<number>(0);

    const [isMapReady, setIsMapReady] = useState(false);
    const [isMapError, setIsMapError] = useState(false);
    const [errorType, setErrorType] = useState<'timeout' | 'permission' | null>(null);
    const [mapReloadKey, setMapReloadKey] = useState(0);

    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [didFitOnce, setDidFitOnce] = useState(false);
    const [activeRegion, setActiveRegion] = useState<Region>(initialRegion || INITIAL_REGION);
    
    const renderCountRef = useRef(0);
    const regionChangeCountRef = useRef(0);
    renderCountRef.current += 1;
    debugLog(`[MAP_DEBUG] ===== Render #${renderCountRef.current} =====`);

    // Flatten data to markers (lightweight — no image URIs to reduce memory)
    const markers = useMemo(() => {
        const _markers: MapMarker[] = [];
        data.forEach((country: any, countryIdx: number) => {
            (country?.regions || []).forEach((r: any) => {
                (r?.items || []).forEach((item: any) => {
                    const loc = item?.originalRecord?.location;

                    const latRaw = loc?.latitude;
                    const lngRaw = loc?.longitude;

                    const lat = parseCoordinateValue(latRaw);
                    const lng = parseCoordinateValue(lngRaw);

                    if (!isValidLatitude(lat as number) || !isValidLongitude(lng as number)) return;
                    const latitude = Number(lat);
                    const longitude = Number(lng);

                    if (latitude === 0 && longitude === 0) return;

                    _markers.push({
                        id: item.id,
                        coordinate: { latitude, longitude },
                        countryId: `${country.country}-${countryIdx}`,
                        emoji: item.emoji,
                        name: item.name,
                    });
                });
            });
        });
        debugLog(`[MAP_DEBUG] Markers computed: ${_markers.length} total`);
        return _markers;
    }, [data]);
    const visibleMarkers = useMemo(
        () => (markers.length > MAX_RENDER_MARKERS ? markers.slice(0, MAX_RENDER_MARKERS) : markers),
        [markers]
    );
    const isMarkerCapped = markers.length > visibleMarkers.length;
    const markerFeatures = useMemo<PointFeature[]>(
        () =>
            markers.map((marker, markerIndex) => ({
                type: 'Feature',
                properties: { markerIndex },
                geometry: {
                    type: 'Point',
                    coordinates: [marker.coordinate.longitude, marker.coordinate.latitude],
                },
            })),
        [markers]
    );
    const supercluster = useMemo(() => {
        if (!ENABLE_MAP_CLUSTERING) return null;
        const index = new Supercluster({
            radius: CLUSTER_RADIUS,
            maxZoom: CLUSTER_MAX_ZOOM,
            minZoom: CLUSTER_MIN_ZOOM,
        });
        index.load(markerFeatures);
        return index;
    }, [markerFeatures]);
    const clusteredItems = useMemo<ClusterOrPoint[]>(() => {
        if (!ENABLE_MAP_CLUSTERING || !supercluster) return [];
        const bbox = toBoundingBox(activeRegion);
        const zoom = toApproxZoom(activeRegion);
        return supercluster.getClusters(bbox, zoom) as unknown as ClusterOrPoint[];
    }, [activeRegion, supercluster]);
    const visibleClusteredItems = useMemo(
        () =>
            clusteredItems.length > MAX_RENDER_MARKERS
                ? clusteredItems.slice(0, MAX_RENDER_MARKERS)
                : clusteredItems,
        [clusteredItems]
    );
    const isClusteredCapped = clusteredItems.length > visibleClusteredItems.length;
    const renderedItemCount = ENABLE_MAP_CLUSTERING ? visibleClusteredItems.length : visibleMarkers.length;

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

    useEffect(() => {
        if (ENABLE_MAP_CLUSTERING && isClusteredCapped) {
            setToastMessage(`클러스터 최적화: ${visibleClusteredItems.length}/${clusteredItems.length}`);
            return;
        }

        if (!ENABLE_MAP_CLUSTERING && isMarkerCapped) {
            setToastMessage(`표시 최적화: ${visibleMarkers.length}/${markers.length}`);
        }
    }, [
        clusteredItems.length,
        isClusteredCapped,
        isMarkerCapped,
        markers.length,
        visibleClusteredItems.length,
        visibleMarkers.length,
    ]);

    useEffect(() => {
        return () => {
            if (regionDebounceRef.current) {
                clearTimeout(regionDebounceRef.current);
            }
        };
    }, []);

    useEffect(() => {
        if (!(ENABLE_QA_MAP_METRICS && __DEV__)) return;

        metricsWindowStartRef.current = Date.now();
        metricsRegionEventCountRef.current = 0;

        const intervalId = setInterval(() => {
            const now = Date.now();
            const elapsedSec = Math.max((now - metricsWindowStartRef.current) / 1000, 1);
            const eps = metricsRegionEventCountRef.current / elapsedSec;

            metricsLog(
                `[MAP_METRICS] os=${Platform.OS} eps=${eps.toFixed(2)} rendered=${renderedItemCount} totalMarkers=${markers.length} clustering=${ENABLE_MAP_CLUSTERING}`
            );

            metricsWindowStartRef.current = now;
            metricsRegionEventCountRef.current = 0;
        }, 5000);

        return () => clearInterval(intervalId);
    }, [renderedItemCount, markers.length]);

    const handleRegionChangeComplete = useCallback((r: Region) => {
        if (ENABLE_QA_MAP_METRICS && __DEV__) {
            metricsRegionEventCountRef.current += 1;
        }

        if (
            !isValidLatitude(r.latitude) ||
            !isValidLongitude(r.longitude) ||
            !isValidDelta(r.latitudeDelta) ||
            !isValidDelta(r.longitudeDelta)
        ) {
            return;
        }

        const regionKey = buildRegionKey(r);
        if (lastRegionKeyRef.current === regionKey) {
            return;
        }

        lastRegionKeyRef.current = regionKey;
        regionChangeCountRef.current += 1;
        debugLog(
            `[MAP_DEBUG] onRegionChangeComplete #${regionChangeCountRef.current} | lat=${r.latitude.toFixed(4)} lng=${r.longitude.toFixed(4)} delta=${r.latitudeDelta.toFixed(4)}`
        );

        if (regionDebounceRef.current) {
            clearTimeout(regionDebounceRef.current);
        }

        regionDebounceRef.current = setTimeout(() => {
            setActiveRegion(r);
            onRegionChange?.(r);
        }, REGION_UPDATE_DEBOUNCE_MS);
    }, [onRegionChange]);

    const handleClusterPress = useCallback(
        (cluster: ClusterFeature) => {
            const [lng, lat] = cluster.geometry.coordinates;
            const nextLatitudeDelta = Math.max(activeRegion.latitudeDelta * 0.5, 0.01);
            const nextLongitudeDelta = Math.max(activeRegion.longitudeDelta * 0.5, 0.01);

            mapRef.current?.animateToRegion(
                {
                    latitude: lat,
                    longitude: lng,
                    latitudeDelta: nextLatitudeDelta,
                    longitudeDelta: nextLongitudeDelta,
                },
                250
            );
        },
        [activeRegion.latitudeDelta, activeRegion.longitudeDelta]
    );

    const isPermissionError = errorType === 'permission';
    const errorTitle = isPermissionError ? '위치 권한이 필요합니다' : 'Map Unavailable';
    const errorDescription = isPermissionError
        ? '지도에서 음식 기록을 보려면\n위치 서비스를 허용해주세요.'
        : '네트워크 연결을 확인해주세요.';

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
                    <View style={{ padding: 20, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.85)', alignItems: 'center' }}>
                        <Text style={{ fontSize: 32 }}>🌏</Text>
                        <Text style={{ marginTop: 8, color: '#475569', fontWeight: '600' }}>No trips yet</Text>
                    </View>
                </View>
            )}

            <MapView
                key={mapReloadKey}
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_DEFAULT}
                initialRegion={initialRegion || INITIAL_REGION}
                onMapReady={() => {
                    debugLog(`[MAP_DEBUG] 🗺️ onMapReady fired`);
                    setIsMapReady(true);
                    onReady?.();
                }}
                onRegionChangeComplete={handleRegionChangeComplete}
                maxZoomLevel={20}
                minZoomLevel={1}
            >
                {ENABLE_MAP_CLUSTERING
                    ? visibleClusteredItems.map((item: ClusterOrPoint) => {
                          if (isClusterFeature(item)) {
                              return (
                                  <Marker
                                      key={`cluster-${item.properties.cluster_id}`}
                                      coordinate={{
                                          latitude: item.geometry.coordinates[1],
                                          longitude: item.geometry.coordinates[0],
                                      }}
                                      anchor={{ x: 0.5, y: 0.5 }}
                                      tracksViewChanges={false}
                                      onPress={() => handleClusterPress(item)}
                                  >
                                      <View style={styles.clusterContainer}>
                                          <View style={styles.clusterCircle}>
                                              <Text style={styles.clusterEmoji}>📍</Text>
                                          </View>
                                          <View style={styles.clusterBadge}>
                                              <Text style={styles.clusterCountText}>{item.properties.point_count}</Text>
                                          </View>
                                      </View>
                                  </Marker>
                              );
                          }

                          const marker = markers[item.properties.markerIndex];
                          if (!marker) return null;

                          return (
                              <Marker
                                  key={`pin-${marker.id}`}
                                  coordinate={marker.coordinate}
                                  anchor={{ x: 0.5, y: 1 }}
                                  tracksViewChanges={false}
                                  onPress={() => onMarkerPress(marker.countryId)}
                              >
                                  <View style={styles.mapPinContainer}>
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
                                  </View>
                              </Marker>
                          );
                      })
                    : visibleMarkers.map((marker: MapMarker) => (
                          <Marker
                              key={`pin-${marker.id}`}
                              coordinate={marker.coordinate}
                              anchor={{ x: 0.5, y: 1 }}
                              tracksViewChanges={false}
                              onPress={() => onMarkerPress(marker.countryId)}
                          >
                              <View style={styles.mapPinContainer}>
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
                              </View>
                          </Marker>
                      ))}
            </MapView>

            {/* Overlay Card */}
            {isMapReady && data.length > 0 && (() => {
                const visitedCount = data.length;
                const percentage = Math.min((visitedCount / TOTAL_COUNTRIES) * 100, 100);

                return (
                    <View style={[styles.mapOverlay, THEME.shadow]}>
                        <View style={[styles.insightCard, styles.insightCardBg]}>
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
                        </View>
                    </View>
                );
            })()}

            {/* Toast Message */}
            {toastMessage && (
                <View style={styles.toastContainer}>
                    <View style={[styles.toast, styles.toastBg]}>
                        <Text style={styles.toastText}>{toastMessage}</Text>
                    </View>
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
    insightCardBg: { backgroundColor: 'rgba(255,255,255,0.92)' },
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
    toastBg: { backgroundColor: 'rgba(0,0,0,0.75)' },
    toastText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' }
});
