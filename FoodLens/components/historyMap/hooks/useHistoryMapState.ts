import { useCallback, useRef, useState } from 'react';
import MapView, { Region } from 'react-native-maps';
import {
    ENABLE_QA_MAP_METRICS,
    INITIAL_REGION,
    REGION_UPDATE_DEBOUNCE_MS,
} from '../constants';
import { ClusterFeature, HistoryMapProps } from '../types';
import {
    buildRegionKey,
    debugLog,
    isValidDelta,
    isValidLatitude,
    isValidLongitude,
} from '../utils/historyMapUtils';
import { useHistoryMapDerivedData } from './useHistoryMapDerivedData';
import { openMapSettings, useHistoryMapEffects } from './useHistoryMapEffects';

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

    const {
        markers,
        visibleMarkers,
        clusteredItems,
        visibleClusteredItems,
        isMarkerCapped,
        isClusteredCapped,
        renderedItemCount,
        favoriteCountry,
    } = useHistoryMapDerivedData({ data, activeRegion });

    useHistoryMapEffects({
        mapRef,
        regionDebounceRef,
        isMapReady,
        isMapError,
        setIsMapError,
        setErrorType,
        didFitOnce,
        setDidFitOnce,
        markers,
        toastMessage,
        setToastMessage,
        isClusteredCapped,
        visibleClusteredItemsLength: visibleClusteredItems.length,
        clusteredItemsLength: clusteredItems.length,
        isMarkerCapped,
        visibleMarkersLength: visibleMarkers.length,
        markersLength: markers.length,
        renderedItemCount,
        metricsWindowStartRef,
        metricsRegionEventCountRef,
    });

    const handleRetry = useCallback(() => {
        setIsMapError(false);
        setErrorType(null);
        setIsMapReady(false);
        setDidFitOnce(false);
        setMapReloadKey((prev) => prev + 1);
    }, []);

    const handleOpenSettings = useCallback(() => {
        openMapSettings();
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
