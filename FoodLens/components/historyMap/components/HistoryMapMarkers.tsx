import React from 'react';
import { Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import * as FileSystem from 'expo-file-system/legacy';
import { ENABLE_MAP_CLUSTERING } from '../constants';
import { ClusterFeature, ClusterOrPoint, MapMarker } from '../types';
import { historyMapStyles as styles } from '../styles';
import { isClusterFeature } from '../utils/historyMapUtils';
import { mapTraceLog, mapTraceWarn } from '../utils/historyMapUtils';

const THUMB_FALLBACK_FONT_SIZE = 16;
const FOOD_MARKER_ANCHOR = { x: 0.5, y: 1 };
const CLUSTER_MARKER_ANCHOR = { x: 0.5, y: 0.5 };
const USE_NATIVE_PIN_MARKERS = true;

// Keep marker snapshots stable to reduce native re-render churn while zooming.
const SHOULD_TRACK_VIEW_CHANGES = false;

type UriKind = 'file' | 'http' | 'asset' | 'none';

const toUriMeta = (uri?: string) => {
    if (!uri) return { kind: 'none' as UriKind, head: '', tail: '', len: 0 };
    const kind: UriKind = uri.startsWith('file://')
        ? 'file'
        : uri.startsWith('http://') || uri.startsWith('https://')
        ? 'http'
        : 'asset';
    return {
        kind,
        head: uri.slice(0, 48),
        tail: uri.slice(-28),
        len: uri.length,
    };
};

type HistoryMapMarkersProps = {
    markers: MapMarker[];
    visibleMarkers: MapMarker[];
    visibleClusteredItems: ClusterOrPoint[];
    onMarkerPress: (countryId: string) => void;
    onClusterPress: (cluster: ClusterFeature) => void;
};

export default function HistoryMapMarkers({
    markers,
    visibleMarkers,
    visibleClusteredItems,
    onMarkerPress,
    onClusterPress,
}: HistoryMapMarkersProps) {
    mapTraceLog('render:markers-component', {
        clustering: ENABLE_MAP_CLUSTERING,
        markersLength: markers.length,
        visibleMarkersLength: visibleMarkers.length,
        visibleClusteredItemsLength: visibleClusteredItems.length,
    });

    const renderFoodMarker = (marker: MapMarker) => {
        if (USE_NATIVE_PIN_MARKERS) {
            return (
                <Marker
                    key={`pin-${marker.id}`}
                    coordinate={marker.coordinate}
                    anchor={FOOD_MARKER_ANCHOR}
                    tracksViewChanges={SHOULD_TRACK_VIEW_CHANGES}
                    onPress={() => onMarkerPress(marker.countryId)}
                    pinColor="#ef4444"
                />
            );
        }

        return (
            <Marker
                key={`pin-${marker.id}`}
                coordinate={marker.coordinate}
                anchor={FOOD_MARKER_ANCHOR}
                tracksViewChanges={SHOULD_TRACK_VIEW_CHANGES}
                onPress={() => onMarkerPress(marker.countryId)}
            >
                <View style={styles.mapPinContainer}>
                    <View pointerEvents="none">
                        <View style={styles.mapPinCircle}>
                            <Text style={{ fontSize: THUMB_FALLBACK_FONT_SIZE }}>{marker.emoji}</Text>
                        </View>
                    </View>
                </View>
            </Marker>
        );
    };

    // Simplified rendering path to prevent bridge congestion and native crashes.
    if (ENABLE_MAP_CLUSTERING) {
        const clusterCount = visibleClusteredItems.filter((item) => isClusterFeature(item)).length;
        const pointCount = visibleClusteredItems.length - clusterCount;
        mapTraceLog('render:cluster-summary', { clusterCount, pointCount });

        const markerNodes = visibleClusteredItems.reduce<React.ReactElement[]>((acc, item) => {
            try {
                if (isClusterFeature(item)) {
                    const clusterLatitude = item.geometry.coordinates[1];
                    const clusterLongitude = item.geometry.coordinates[0];
                    if (!Number.isFinite(clusterLatitude) || !Number.isFinite(clusterLongitude)) {
                        mapTraceWarn('render:cluster-invalid-coordinate', {
                            clusterId: item.properties.cluster_id,
                            coordinates: item.geometry.coordinates,
                        });
                        return acc;
                    }

                    if (USE_NATIVE_PIN_MARKERS) {
                        acc.push(
                            <Marker
                                key={`cluster-${item.properties.cluster_id}`}
                                coordinate={{
                                    latitude: clusterLatitude,
                                    longitude: clusterLongitude,
                                }}
                                anchor={CLUSTER_MARKER_ANCHOR}
                                tracksViewChanges={SHOULD_TRACK_VIEW_CHANGES}
                                onPress={() => onClusterPress(item)}
                                pinColor="#1d4ed8"
                                title={`Cluster ${item.properties.point_count}`}
                            />
                        );
                    } else {
                        acc.push(
                            <Marker
                                key={`cluster-${item.properties.cluster_id}`}
                                coordinate={{
                                    latitude: clusterLatitude,
                                    longitude: clusterLongitude,
                                }}
                                anchor={CLUSTER_MARKER_ANCHOR}
                                tracksViewChanges={SHOULD_TRACK_VIEW_CHANGES}
                                onPress={() => onClusterPress(item)}
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
                    return acc;
                }

                const marker = markers[item.properties.markerIndex];
                if (!marker) {
                    mapTraceWarn('render:marker-not-found-by-index', {
                        markerIndex: item.properties.markerIndex,
                        totalMarkers: markers.length,
                    });
                    return acc;
                }

                if (
                    !Number.isFinite(marker.coordinate.latitude) ||
                    !Number.isFinite(marker.coordinate.longitude)
                ) {
                    mapTraceWarn('render:marker-invalid-coordinate', {
                        markerId: marker.id,
                        coordinate: marker.coordinate,
                    });
                    return acc;
                }

                acc.push(renderFoodMarker(marker));
                return acc;
            } catch (error) {
                mapTraceWarn('render:cluster-item-failed', { error: String(error), item });
                return acc;
            }
        }, []);

        return <>{markerNodes}</>;
    }

    const markerNodes = visibleMarkers.reduce<React.ReactElement[]>((acc, marker) => {
        if (
            !Number.isFinite(marker.coordinate.latitude) ||
            !Number.isFinite(marker.coordinate.longitude)
        ) {
            mapTraceWarn('render:marker-invalid-coordinate', {
                markerId: marker.id,
                coordinate: marker.coordinate,
            });
            return acc;
        }
        acc.push(renderFoodMarker(marker));
        return acc;
    }, []);

    return <>{markerNodes}</>;
}
