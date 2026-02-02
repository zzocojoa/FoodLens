import React, { useRef, useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
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

export default function HistoryMap({ data, initialRegion, onMarkerPress, onReady }: HistoryMapProps) {
    const mapRef = useRef<MapView>(null);
    const [isMapReady, setIsMapReady] = useState(false);
    const [isMapError, setIsMapError] = useState(false);
    const [mapReloadKey, setMapReloadKey] = useState(0);

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
            {isMapReady && data.length === 0 && (
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
                initialRegion={initialRegion || {
                    latitude: 20, longitude: 0,
                    latitudeDelta: 50, longitudeDelta: 50,
                }}
                onMapReady={() => {
                    setIsMapReady(true);
                    if (initialRegion) mapRef.current?.animateToRegion(initialRegion, 1000);
                    onReady?.();
                }}
            >
                {data.map((country, countryIdx) => {
                    const coords = country.coordinates;
                    if (!coords || coords.length < 2) return null;
                    return (
                        <Marker 
                            key={`${country.country}-${countryIdx}`}
                            coordinate={{ latitude: coords[1], longitude: coords[0] }}
                            onPress={() => onMarkerPress(`${country.country}-${countryIdx}`)}
                        >
                            <TouchableOpacity activeOpacity={0.9} style={styles.mapPinContainer}>
                                <View pointerEvents="none">
                                    <BlurView intensity={80} tint="light" style={styles.mapLabel}>
                                        <Text style={styles.mapLabelText} numberOfLines={1} ellipsizeMode="tail">
                                            {country.country} ({country.total})
                                        </Text>
                                    </BlurView>
                                    <View style={styles.mapPinCircle}>
                                        <Text style={{fontSize: 16}}>{country.flag}</Text>
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
