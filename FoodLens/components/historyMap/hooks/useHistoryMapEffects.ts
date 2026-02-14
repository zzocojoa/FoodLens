import { MutableRefObject, useEffect } from 'react';
import MapView from 'react-native-maps';
import * as Location from 'expo-location';
import { ENABLE_MAP_CLUSTERING, ENABLE_QA_MAP_METRICS } from '../constants';
import { metricsLog } from '../utils/historyMapUtils';
import { openAppSettings } from '@/services/ui/permissionDialogs';

const MAP_READY_TIMEOUT_MS = 10000;
const TOAST_HIDE_MS = 2000;
const QA_METRICS_INTERVAL_MS = 5000;
const FIT_EDGE_PADDING = { top: 90, right: 60, bottom: 220, left: 60 };

type UseHistoryMapEffectsParams = {
  mapRef: MutableRefObject<MapView | null>;
  regionDebounceRef: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  isMapReady: boolean;
  isMapError: boolean;
  setIsMapError: (value: boolean) => void;
  setErrorType: (value: 'timeout' | 'permission' | null) => void;
  didFitOnce: boolean;
  setDidFitOnce: (value: boolean) => void;
  markers: { coordinate: { latitude: number; longitude: number } }[];
  toastMessage: string | null;
  setToastMessage: (value: string | null) => void;
  isClusteredCapped: boolean;
  visibleClusteredItemsLength: number;
  clusteredItemsLength: number;
  isMarkerCapped: boolean;
  visibleMarkersLength: number;
  markersLength: number;
  renderedItemCount: number;
  metricsWindowStartRef: MutableRefObject<number>;
  metricsRegionEventCountRef: MutableRefObject<number>;
};

export const useHistoryMapEffects = ({
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
  visibleClusteredItemsLength,
  clusteredItemsLength,
  isMarkerCapped,
  visibleMarkersLength,
  markersLength,
  renderedItemCount,
  metricsWindowStartRef,
  metricsRegionEventCountRef,
}: UseHistoryMapEffectsParams) => {
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
  }, [didFitOnce, isMapReady, mapRef, markers, setDidFitOnce]);

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
  }, [isMapError, isMapReady, setErrorType, setIsMapError]);

  useEffect(() => {
    if (!toastMessage) return undefined;
    const timer = setTimeout(() => setToastMessage(null), TOAST_HIDE_MS);
    return () => clearTimeout(timer);
  }, [toastMessage, setToastMessage]);

  useEffect(() => {
    if (ENABLE_MAP_CLUSTERING && isClusteredCapped) {
      setToastMessage(`클러스터 최적화: ${visibleClusteredItemsLength}/${clusteredItemsLength}`);
      return;
    }
    if (!ENABLE_MAP_CLUSTERING && isMarkerCapped) {
      setToastMessage(`표시 최적화: ${visibleMarkersLength}/${markersLength}`);
    }
  }, [
    clusteredItemsLength,
    isClusteredCapped,
    isMarkerCapped,
    markersLength,
    visibleClusteredItemsLength,
    visibleMarkersLength,
    setToastMessage,
  ]);

  useEffect(() => {
    const debounceRef = regionDebounceRef;
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [regionDebounceRef]);

  useEffect(() => {
    if (!(ENABLE_QA_MAP_METRICS && __DEV__)) return;

    metricsWindowStartRef.current = Date.now();
    metricsRegionEventCountRef.current = 0;

    const intervalId = setInterval(() => {
      const now = Date.now();
      const elapsedSec = Math.max((now - metricsWindowStartRef.current) / 1000, 1);
      const eps = metricsRegionEventCountRef.current / elapsedSec;

      metricsLog(
        `[MAP_METRICS] eps=${eps.toFixed(2)} rendered=${renderedItemCount} totalMarkers=${markersLength} clustering=${ENABLE_MAP_CLUSTERING}`
      );

      metricsWindowStartRef.current = now;
      metricsRegionEventCountRef.current = 0;
    }, QA_METRICS_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [markersLength, renderedItemCount, metricsRegionEventCountRef, metricsWindowStartRef]);
};

export const openMapSettings = () => {
  openAppSettings();
};
