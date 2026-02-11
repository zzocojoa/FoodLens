import React from 'react';
import { Text, View } from 'react-native';
import { Marker } from 'react-native-maps';
import { FoodThumbnail } from '@/components/FoodThumbnail';
import { ENABLE_MAP_CLUSTERING } from '../constants';
import { ClusterFeature, ClusterOrPoint, MapMarker } from '../types';
import { historyMapStyles as styles } from '../styles';
import { isClusterFeature } from '../utils/historyMapUtils';

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
                                anchor={{ x: 0.5, y: 0.5 }}
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
                                        <FoodThumbnail
                                            uri={marker.imageUri}
                                            emoji={marker.emoji}
                                            style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'transparent' }}
                                            imageStyle={{ borderRadius: 14 }}
                                            fallbackFontSize={16}
                                        />
                                    </View>
                                </View>
                            </View>
                        </Marker>
                    );
                })}
            </>
        );
    }

    return (
        <>
            {visibleMarkers.map((marker) => (
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
                                <FoodThumbnail
                                    uri={marker.imageUri}
                                    emoji={marker.emoji}
                                    style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: 'transparent' }}
                                    imageStyle={{ borderRadius: 14 }}
                                    fallbackFontSize={16}
                                />
                            </View>
                        </View>
                    </View>
                </Marker>
            ))}
        </>
    );
}
