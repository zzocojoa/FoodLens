import React from 'react';
import { Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { FoodThumbnail } from '@/components/FoodThumbnail';
import { ENABLE_MAP_CLUSTERING } from '../constants';
import { ClusterFeature, ClusterOrPoint, MapMarker } from '../types';
import { historyMapStyles as styles } from '../styles';
import { isClusterFeature } from '../utils/historyMapUtils';

const THUMB_SIZE = 28;
const THUMB_RADIUS = 14;
const THUMB_FALLBACK_FONT_SIZE = 16;
const FOOD_MARKER_ANCHOR = { x: 0.5, y: 1 };
const CLUSTER_MARKER_ANCHOR = { x: 0.5, y: 0.5 };

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
    const renderFoodMarker = (marker: MapMarker) => (
        <Marker
            key={`pin-${marker.id}`}
            coordinate={marker.coordinate}
            anchor={FOOD_MARKER_ANCHOR}
            tracksViewChanges={false}
            onPress={() => onMarkerPress(marker.countryId)}
        >
            <View style={styles.mapPinContainer}>
                <View pointerEvents="none">
                    <View style={styles.mapPinCircle}>
                        <FoodThumbnail
                            uri={marker.imageUri}
                            emoji={marker.emoji}
                            style={{
                                width: THUMB_SIZE,
                                height: THUMB_SIZE,
                                borderRadius: THUMB_RADIUS,
                                backgroundColor: 'transparent',
                            }}
                            imageStyle={{ borderRadius: THUMB_RADIUS }}
                            fallbackFontSize={THUMB_FALLBACK_FONT_SIZE}
                        />
                    </View>
                </View>
            </View>
        </Marker>
    );

    if (ENABLE_MAP_CLUSTERING) {
        return (
            <>
                {visibleClusteredItems.map((item) => {
                    if (isClusterFeature(item)) {
                        return (
                            <Marker
                                key={`cluster-${item.properties.cluster_id}`}
                                coordinate={{
                                    latitude: item.geometry.coordinates[1],
                                    longitude: item.geometry.coordinates[0],
                                }}
                                anchor={CLUSTER_MARKER_ANCHOR}
                                tracksViewChanges={false}
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

                    const marker = markers[item.properties.markerIndex];
                    if (!marker) return null;

                    return renderFoodMarker(marker);
                })}
            </>
        );
    }

    return (
        <>
            {visibleMarkers.map((marker) => renderFoodMarker(marker))}
        </>
    );
}
