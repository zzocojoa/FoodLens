import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';
import MapView, { Region } from 'react-native-maps';
import * as Location from 'expo-location';
import Supercluster from 'supercluster';
import {
    CLUSTER_MAX_ZOOM,
    CLUSTER_MIN_ZOOM,
    CLUSTER_RADIUS,
    ENABLE_MAP_CLUSTERING,
    ENABLE_QA_MAP_METRICS,
    INITIAL_REGION,
    MAX_RENDER_MARKERS,
    REGION_UPDATE_DEBOUNCE_MS,
} from '../constants';
import { ClusterFeature, ClusterOrPoint, HistoryMapProps } from '../types';
import {
    buildRegionKey,
    debugLog,
    flattenMarkers,
    getFavoriteCountry,
    isValidDelta,
    isValidLatitude,
    isValidLongitude,
    metricsLog,
    toApproxZoom,
    toBoundingBox,
    toMarkerFeatures,
} from '../utils/historyMapUtils';

const MAP_READY_TIMEOUT_MS = 10000;
const TOAST_HIDE_MS = 2000;
const QA_METRICS_INTERVAL_MS = 5000;
const FIT_EDGE_PADDING = { top: 90, right: 60, bottom: 220, left: 60 };

export const useHistoryMapState = ({
    data,
    initialRegion,
    onReady,
    onRegionChange,
}: Pick<HistoryMapProps, 'data' | 'initialRegion' | 'onReady' | 'onRegionChange'>) => {
    const mapRef = useRef<MapView>(null);
    const regionDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastRegionKeyRef = useRef<string | null>(null);
    const metricsWindowStartRef = useRef<number>(Date.now());
    const metricsRegionEventCountRef = useRef<number>(0);
    const renderCountRef = useRef(0);
    const regionChangeCountRef = useRef(0);

    const [isMapReady, setIsMapReady] = useState(false);
    const [isMapError, setIsMapError] = useState(false);
    const [errorType, setErrorType] = useState<'timeout' | 'permission' | null>(null);
    const [mapReloadKey, setMapReloadKey] = useState(0);
    const [toastMessage, setToastMessage] = useState<string | null>(null);
    const [didFitOnce, setDidFitOnce] = useState(false);
    const [activeRegion, setActiveRegion] = useState<Region>(initialRegion || INITIAL_REGION);

    renderCountRef.current += 1;
    debugLog(`[MAP_DEBUG] ===== Render #${renderCountRef.current} =====`);

    const markers = useMemo(() => {
        const nextMarkers = flattenMarkers(data);
        debugLog(`[MAP_DEBUG] Markers computed: ${nextMarkers.length} total`);
        return nextMarkers;
    }, [data]);

    const visibleMarkers = useMemo(
        () => (markers.length > MAX_RENDER_MARKERS ? markers.slice(0, MAX_RENDER_MARKERS) : markers),
        [markers]
    );

    const isMarkerCapped = markers.length > visibleMarkers.length;

    const markerFeatures = useMemo(() => toMarkerFeatures(markers), [markers]);

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

    const favoriteCountry = useMemo(() => getFavoriteCountry(data), [data]);

    useEffect(() => {
        if (!isMapReady) return;
        if (!mapRef.current) return;
        if (didFitOnce) return;
        if (markers.length === 0) return;

        const coords = markers.map((m) => m.coordinate);

        mapRef.current.fitToCoordinates(coords, {
            edgePadding: FIT_EDGE_PADDING,
            animated: true,
        });

        setDidFitOnce(true);
    }, [didFitOnce, isMapReady, markers]);

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
                }, MAP_READY_TIMEOUT_MS);
            }
        };

        void checkPermissionAndTimeout();

        return () => {
            if (timeout) clearTimeout(timeout);
        };
    }, [isMapError, isMapReady]);

    useEffect(() => {
        if (toastMessage) {
            const timer = setTimeout(() => setToastMessage(null), TOAST_HIDE_MS);
            return () => clearTimeout(timer);
        }
        return undefined;
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
                `[MAP_METRICS] eps=${eps.toFixed(2)} rendered=${renderedItemCount} totalMarkers=${markers.length} clustering=${ENABLE_MAP_CLUSTERING}`
            );

            metricsWindowStartRef.current = now;
            metricsRegionEventCountRef.current = 0;
        }, QA_METRICS_INTERVAL_MS);

        return () => clearInterval(intervalId);
    }, [markers.length, renderedItemCount]);

    const handleRetry = useCallback(() => {
        setIsMapError(false);
        setErrorType(null);
        setIsMapReady(false);
        setDidFitOnce(false);
        setMapReloadKey((prev) => prev + 1);
    }, []);

    const handleOpenSettings = useCallback(() => {
        void Linking.openSettings();
    }, []);

    const handleRegionChangeComplete = useCallback(
        (region: Region) => {
            if (ENABLE_QA_MAP_METRICS && __DEV__) {
                metricsRegionEventCountRef.current += 1;
            }

            if (
                !isValidLatitude(region.latitude) ||
                !isValidLongitude(region.longitude) ||
                !isValidDelta(region.latitudeDelta) ||
                !isValidDelta(region.longitudeDelta)
            ) {
                return;
            }

            const regionKey = buildRegionKey(region);
            if (lastRegionKeyRef.current === regionKey) {
                return;
            }

            lastRegionKeyRef.current = regionKey;
            regionChangeCountRef.current += 1;
            debugLog(
                `[MAP_DEBUG] onRegionChangeComplete #${regionChangeCountRef.current} | lat=${region.latitude.toFixed(4)} lng=${region.longitude.toFixed(4)} delta=${region.latitudeDelta.toFixed(4)}`
            );

            if (regionDebounceRef.current) {
                clearTimeout(regionDebounceRef.current);
            }

            regionDebounceRef.current = setTimeout(() => {
                setActiveRegion(region);
                onRegionChange?.(region);
            }, REGION_UPDATE_DEBOUNCE_MS);
        },
        [onRegionChange]
    );

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

    const handleMapReady = useCallback(() => {
        debugLog('[MAP_DEBUG] 🗺️ onMapReady fired');
        setIsMapReady(true);
        onReady?.();
    }, [onReady]);

    return {
        mapRef,
        mapReloadKey,
        isMapReady,
        isMapError,
        errorType,
        toastMessage,
        favoriteCountry,
        markers,
        visibleMarkers,
        clusteredItems,
        visibleClusteredItems,
        renderedItemCount,
        handleRetry,
        handleOpenSettings,
        handleRegionChangeComplete,
        handleClusterPress,
        handleMapReady,
    };
};
