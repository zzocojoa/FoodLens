import React, { useRef, useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions, Platform } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT, Region } from 'react-native-maps';
import useSupercluster from 'use-supercluster';
import { BlurView } from 'expo-blur';
import { Globe } from 'lucide-react-native';
import { THEME } from '../constants/theme';
import { CountryData } from '../models/History';

interface HistoryMapProps {
    data: CountryData[];
    initialRegion: any;
    onMarkerPress: (countryId: string) => void;
    onReady?: () => void;
}

const INITIAL_REGION = {
    latitude: 20, longitude: 0,
    latitudeDelta: 50, longitudeDelta: 50,
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const MAP_WIDTH = SCREEN_WIDTH - 40; // Subtract horizontal margins

// Helper: Convert Zoom Level to Longitude Delta
const getDeltaFromZoom = (zoom: number) => {
    return (360 * (MAP_WIDTH / 256)) / Math.pow(2, zoom);
};

// Helper: Convert Longitude Delta to Zoom Level
const getZoomFromDelta = (delta: number) => {
    return Math.round(Math.log2(360 * ((MAP_WIDTH / 256) / delta)));
};

export default function HistoryMap({ data, initialRegion, onMarkerPress, onReady }: HistoryMapProps) {
    const mapRef = useRef<MapView>(null);
    const [isMapReady, setIsMapReady] = useState(false);
    const [isMapError, setIsMapError] = useState(false);
    const [mapReloadKey, setMapReloadKey] = useState(0);
    const [bounds, setBounds] = useState<any>(null);
    const [zoom, setZoom] = useState(1);

    // Flatten data to GeoJSON points for Supercluster
    const points = useMemo(() => {
        const _points: any[] = [];
        data.forEach((country, countryIdx) => {
            country.regions.forEach(region => {
                region.items.forEach(item => {
                     const loc = item.originalRecord.location;
                     if (loc && loc.latitude && loc.longitude && (loc.latitude !== 0 || loc.longitude !== 0)) {
                         _points.push({
                             type: 'Feature',
                             properties: {
                                 cluster: false,
                                 itemId: item.id,
                                 countryId: `${country.country}-${countryIdx}`,
                                 emoji: item.emoji,
                                 name: item.name,
                                 imageUri: item.originalRecord.imageUri, // Pass image URI
                                 category: 'food'
                             },
                             geometry: {
                                 type: 'Point',
                                 coordinates: [loc.longitude, loc.latitude]
                             }
                         });
                     }
                });
            });
        });
        return _points;
    }, [data]);

    // Use Supercluster Hook
    const { clusters, supercluster } = useSupercluster({
        points,
        bounds,
        zoom,
        options: { radius: 35, maxZoom: 15 } // Reduced radius and maxZoom to force separation
    });

    // Update map bounds and zoom on change
    const updateMapState = async (region?: Region) => {
        if (!mapRef.current) return;
        
        try {
            const boundaries = await mapRef.current.getMapBoundaries();
            
            // Convert region to bbox [west, south, east, north]
            const newBounds = [
                boundaries.southWest.longitude,
                boundaries.southWest.latitude,
                boundaries.northEast.longitude,
                boundaries.northEast.latitude
            ];
            setBounds(newBounds);

            // Calculate zoom level manually (Reliable on all platforms)
            let longitudeDelta = region?.longitudeDelta;
            
            // If region object behaves oddly (iOS edge case), derive delta from boundaries
            if (!longitudeDelta) {
                longitudeDelta = boundaries.northEast.longitude - boundaries.southWest.longitude;
                if (longitudeDelta < 0) longitudeDelta += 360; // Handle date line crossing
            }

            if (longitudeDelta) {
                setZoom(getZoomFromDelta(longitudeDelta));
            }
        } catch (e) {
            console.warn("Map update error:", e);
        }
    };

    // Timeout watchdog
    useEffect(() => {
        let timeout: ReturnType<typeof setTimeout>;
        if (!isMapReady && !isMapError) {
            timeout = setTimeout(() => {
                if (!isMapReady) setIsMapError(true);
            }, 10000);
        }
        return () => clearTimeout(timeout);
    }, [isMapReady, isMapError]);

    const handleRetry = () => {
        setIsMapError(false);
        setIsMapReady(false);
        setMapReloadKey(prev => prev + 1);
    };

    return (
        <View style={styles.mapContainer}>
            {/* Error State */}
            {isMapError && (
                <View style={[StyleSheet.absoluteFill, {backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center', zIndex: 20}]}>
                    <View style={{alignItems: 'center', opacity: 0.5}}>
                        <Globe size={48} color="#94A3B8" />
                        <Text style={{marginTop: 12, color: '#64748B', fontWeight: '600'}}>Map Unavailable</Text>
                        <TouchableOpacity onPress={handleRetry} style={{marginTop: 16, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#E2E8F0', borderRadius: 20}}>
                            <Text style={{fontSize: 12, fontWeight: '700', color: '#475569'}}>RETRY</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Loading State */}
            {!isMapReady && !isMapError && (
                <View style={[StyleSheet.absoluteFill, {backgroundColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', zIndex: 10}]}>
                    <Text style={{fontSize: 24, marginBottom: 12}}>🗺️</Text>
                    <Text style={{color: '#64748B', fontSize: 12, fontWeight: '600'}}>Loading Map...</Text>
                </View>
            )}

            {/* Empty State */}
            {isMapReady && points.length === 0 && (
                <View style={[StyleSheet.absoluteFill, {alignItems: 'center', justifyContent: 'center', zIndex: 5, pointerEvents: 'none'}]}>
                    <BlurView intensity={40} tint="light" style={{padding: 20, borderRadius: 20, overflow: 'hidden', alignItems: 'center'}}>
                        <Text style={{fontSize: 32}}>🌏</Text>
                        <Text style={{marginTop: 8, color: '#475569', fontWeight: '600'}}>No trips yet</Text>
                    </BlurView>
                </View>
            )}

            <MapView
                key={mapReloadKey}
                ref={mapRef}
                style={styles.map}
                provider={PROVIDER_DEFAULT}
                initialRegion={initialRegion || INITIAL_REGION}
                onMapReady={() => {
                    setIsMapReady(true);
                    if (initialRegion) mapRef.current?.animateToRegion(initialRegion, 1000);
                    onReady?.();
                    updateMapState();
                }}
                onRegionChangeComplete={updateMapState}
            >
                {clusters.map((cluster) => {
                    const [longitude, latitude] = cluster.geometry.coordinates;
                    const { cluster: isCluster, point_count: pointCount } = cluster.properties;

                    if (isCluster) {
                        // CLUSTER MARKER (Photo Stack)
                        const clusterId = cluster.id;
                        
                        // Get leaves to find the first image
                        const leaves = supercluster?.getLeaves(clusterId, 1);
                        const firstImage = (leaves && leaves[0]?.properties?.imageUri) || null;

                        return (
                            <Marker
                                key={`cluster-${clusterId}`}
                                coordinate={{ latitude, longitude }}
                                onPress={() => {
                                    const expansionZoom = Math.min(
                                        supercluster.getClusterExpansionZoom(clusterId),
                                        20
                                    );
                                    
                                    // Apple Maps (compatible with Google Maps too) requires animateToRegion with deltas
                                    // animateCamera({ zoom }) is often ignored or unreliable on iOS default maps
                                    const longitudeDelta = getDeltaFromZoom(expansionZoom);
                                    const latitudeDelta = longitudeDelta; // Use square ratio, map will adjust aspect

                                    mapRef.current?.animateToRegion({
                                        latitude,
                                        longitude,
                                        latitudeDelta,
                                        longitudeDelta
                                    }, 500);
                                }}
                            >
                                <View style={styles.clusterContainer}>
                                    {/* Photo Thumbnail */}
                                    {firstImage ? (
                                        <Image 
                                            source={{ uri: firstImage }} 
                                            style={styles.clusterImage} 
                                        />
                                    ) : (
                                        <View style={[styles.clusterImage, { backgroundColor: '#CBD5E1', alignItems: 'center', justifyContent: 'center' }]}>
                                             <Text>📷</Text>
                                        </View>
                                    )}
                                    {/* Count Badge */}
                                    <View style={styles.clusterBadge}>
                                        <Text style={styles.clusterCountText}>{pointCount}</Text>
                                    </View>
                                </View>
                            </Marker>
                        );
                    }

                    // INDIVIDUAL MARKER
                    return (
                        <Marker
                            key={`pin-${cluster.properties.itemId}`}
                            coordinate={{ latitude, longitude }}
                            onPress={() => onMarkerPress(cluster.properties.countryId)}
                        >
                             <TouchableOpacity activeOpacity={0.9} style={styles.mapPinContainer}>
                                <View pointerEvents="none">
                                    <BlurView intensity={80} tint="light" style={styles.mapLabel}>
                                        <Text style={styles.mapLabelText} numberOfLines={1} ellipsizeMode="tail">
                                            {cluster.properties.name}
                                        </Text>
                                    </BlurView>
                                    <View style={styles.mapPinCircle}>
                                        {cluster.properties.imageUri ? (
                                            <Image 
                                                source={{ uri: cluster.properties.imageUri }} 
                                                style={{ width: '100%', height: '100%', borderRadius: 16 }}
                                            />
                                        ) : (
                                            <Text style={{fontSize: 16}}>{cluster.properties.emoji}</Text>
                                        )}
                                    </View>
                                </View>
                            </TouchableOpacity>
                        </Marker>
                    );
                })}
            </MapView>

            {/* Overlay Card */}
            {isMapReady && data.length > 0 && (() => {
                const TOTAL_COUNTRIES = 195;
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
                                <Text style={styles.insightValue}>{data.sort((a,b) => b.total - a.total)[0]?.country || '-'}</Text>
                            </View>
                            <View style={styles.progressBarBg}>
                                <View style={[styles.progressBarFill, { width: `${percentage}%` }]} />
                            </View>
                            <Text style={styles.insightHint}>Visited {visitedCount} of {TOTAL_COUNTRIES} countries</Text>
                        </BlurView>
                    </View>
                );
            })()}
        </View>
    );
}

const styles = StyleSheet.create({
    mapContainer: { flex: 1, overflow: 'hidden', marginHorizontal: 20, marginBottom: 20, borderRadius: 32, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#F1F5F9' },
    map: { width: '100%', height: '100%' },
    mapPinContainer: { alignItems: 'center' },
    mapLabel: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, overflow: 'hidden', marginBottom: 4 },
    mapLabelText: { fontSize: 10, fontWeight: '700', color: '#1E293B', maxWidth: 100 },
    mapPinCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#FFFFFF', shadowColor: '#000', shadowOffset: {width:0, height:2}, shadowOpacity: 0.1, shadowRadius: 3, elevation: 3 },
    
    // Cluster Styles
    clusterContainer: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    clusterImage: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: '#FFFFFF' },
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
    insightHint: { fontSize: 11, color: '#94A3B8', textAlign: 'center', marginTop: 4 }
});
