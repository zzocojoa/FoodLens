import React, { useState, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Dimensions, Animated, Easing } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShieldCheck, ChevronLeft, MapPin, Navigation, ArrowRight } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';
import { UserService } from '../services/userService';
import { AnalysisService } from '../services/analysisService';
import * as Location from 'expo-location';

import { Colors } from '../constants/theme';
import { useColorScheme } from '../hooks/use-color-scheme';

export default function TripStatisticsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];
    
    const [loading, setLoading] = useState(true);
    const [safeCount, setSafeCount] = useState(0);
    const [totalCount, setTotalCount] = useState(0);
    const [currentLocation, setCurrentLocation] = useState<string | null>(null);
    const [isLocating, setIsLocating] = useState(false);
    const [tripStartDate, setTripStartDate] = useState<Date | null>(null);

    // Toast State
    const [showToast, setShowToast] = useState(false);
    const toastOpacity = useRef(new Animated.Value(0)).current;
    const toastTranslate = useRef(new Animated.Value(-50)).current;

    const TEST_UID = "test-user-v1";

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    const loadData = async () => {
        try {
            setLoading(true);
            const user = await UserService.getUserProfile(TEST_UID);
            const allAnalyses = await AnalysisService.getAllAnalyses(TEST_UID);

            setTotalCount(allAnalyses.length);

            if (user?.currentTripStart) {
                const startTime = new Date(user.currentTripStart).getTime();
                setTripStartDate(new Date(user.currentTripStart));
                
                // Filter for current trip with robust time comparison
                const tripAnalyses = allAnalyses.filter(item => {
                    const itemTime = new Date(item.timestamp).getTime();
                    return itemTime >= startTime && item.safetyStatus === 'SAFE';
                });
                setSafeCount(tripAnalyses.length);
                
                // Restore location from profile
                if (user.currentTripLocation) {
                    setCurrentLocation(user.currentTripLocation);
                }
            } else {
                // Fallback: Show total safe items if no active trip
                const totalSafe = allAnalyses.filter(item => item.safetyStatus === 'SAFE').length;
                setSafeCount(totalSafe);
                setTripStartDate(null);
            }

        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const showTripToast = () => {
        setShowToast(true);

        const animate = (value: Animated.Value, toValue: number, duration: number, easing?: any) => 
            Animated.timing(value, { toValue, duration, useNativeDriver: true, easing });

        Animated.parallel([
            animate(toastOpacity, 1, 300),
            animate(toastTranslate, insets.top + 10, 400, Easing.out(Easing.back(1.5)))
        ]).start();

        // Auto hide after 3 seconds
        setTimeout(() => {
            Animated.parallel([
                animate(toastOpacity, 0, 300),
                animate(toastTranslate, -50, 300)
            ]).start(() => setShowToast(false));
        }, 4000);
    };

    const handleStartNewTrip = async () => {
        setIsLocating(true);
        try {
            // 1. Request Permissions
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert(
                    "Permission Denied", 
                    "Location access is needed to tag your trip. Please enable it in settings."
                );
                setIsLocating(false);
                return;
            }

            // 2. Get Coordinates
            const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const { latitude, longitude } = location.coords;

            // 3. Reverse Geocode
            let locationName = "Unknown Location";
            try {
                const reverseGeocode = await Location.reverseGeocodeAsync({ latitude, longitude });
                if (reverseGeocode.length > 0) {
                    const place = reverseGeocode[0];
                    locationName = `${place.city || place.region || ''}, ${place.country || ''}`;
                    // Cleanup comma if one part is missing
                    if (locationName.startsWith(', ')) locationName = locationName.substring(2);
                    if (locationName.endsWith(', ')) locationName = locationName.substring(0, locationName.length - 2);
                }
            } catch (geocodeError) {
                console.warn("Geocoding failed", geocodeError);
                locationName = `Lat: ${latitude.toFixed(2)}, Lon: ${longitude.toFixed(2)}`;
            }

            // 4. Update Profile
            const now = new Date();
            await UserService.CreateOrUpdateProfile(TEST_UID, "", {
                currentTripStart: now.toISOString(),
                currentTripLocation: locationName,
                currentTripCoordinates: { latitude, longitude }
            });
            
            // 5. Update Local State
            setTripStartDate(now);
            setSafeCount(0);
            setCurrentLocation(locationName);
            
            showTripToast(); // Trigger custom toast

        } catch (e) {
            console.error(e);
            Alert.alert("Error", "Failed to get location. Please try again.");
        } finally {
            setIsLocating(false);
        }
    };

    return (
        <View style={[styles.container, {backgroundColor: theme.background}]}>
            <View style={styles.backgroundContainer} />
            
            <SafeAreaView style={{flex: 1}}>
                <ScrollView 
                    contentContainerStyle={{paddingBottom: 40, paddingHorizontal: 24, paddingTop: 16}}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity 
                            onPress={() => router.back()}
                            style={[styles.backButton, {backgroundColor: theme.glass, borderColor: theme.border}]}
                        >
                            <View pointerEvents="none">
                                <ChevronLeft size={24} color={theme.textPrimary} />
                            </View>
                        </TouchableOpacity>
                        <Text style={[styles.headerTitle, {color: theme.textPrimary}]}>Trip Statistics</Text>
                        <View style={{width: 40}} /> 
                    </View>

                    {/* Main Stats Card */}
                    <BlurView intensity={80} tint={colorScheme === 'dark' ? 'dark' : 'light'} style={[styles.mainCard, {backgroundColor: theme.glass, borderColor: theme.glassBorder, shadowColor: theme.shadow}, THEME_STYLES.glass]}>
                        <View style={[styles.shieldIconContainer, {backgroundColor: colorScheme === 'dark' ? 'rgba(22, 101, 52, 0.3)' : '#DCFCE7'}]}>
                            <ShieldCheck size={40} color={colorScheme === 'dark' ? '#4ADE80' : '#166534'} />
                        </View>
                        <ActivityIndicator animating={loading} style={{ position: 'absolute', top: 20 }} color={theme.textSecondary} />
                        <Text style={[styles.bigCount, {color: theme.textPrimary}]}>{safeCount}</Text>
                        <Text style={[styles.statDescription, {color: theme.textSecondary}]}>
                            Confirmed safe during{'\n'}
                            {tripStartDate ? 'current trip' : 'all-time record'}
                        </Text>

                        {/* Global Record Link */}
                        <TouchableOpacity 
                            style={[styles.globalLink, {borderTopColor: theme.border}]}
                            onPress={() => router.push('/history')}
                        >
                             <View pointerEvents="none" style={{flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}>
                                <Text style={[styles.globalLinkText, {color: theme.textSecondary}]}>Global Record</Text>
                                <View style={styles.globalLinkRight}>
                                    <Text style={[styles.globalCountText, {color: theme.textPrimary}]}>Total {totalCount} Items</Text>
                                    <ArrowRight size={16} color={theme.textSecondary} />
                                </View>
                            </View>
                        </TouchableOpacity>
                    </BlurView>

                    {/* Trip Management Card */}
                    <BlurView intensity={70} tint={colorScheme === 'dark' ? 'dark' : 'light'} style={[styles.tripCard, {backgroundColor: theme.glass, borderColor: theme.glassBorder}, THEME_STYLES.glass]}>
                        <View style={styles.tripHeader}>
                            <View style={[styles.mapIconBox, {backgroundColor: theme.surface}]}>
                                <MapPin size={24} color="#3B82F6" />
                            </View>
                            <View>
                                <Text style={[styles.tripTitle, {color: theme.textPrimary}]}>Current Trip</Text>
                                <Text style={[styles.tripLocation, {color: theme.textSecondary}]}>
                                    {currentLocation || "Location not set"}
                                </Text>
                            </View>
                        </View>

                        <TouchableOpacity 
                            onPress={handleStartNewTrip}
                            disabled={isLocating}
                            activeOpacity={0.8}
                            style={[
                                styles.startButton,
                                isLocating && styles.startButtonDisabled
                            ]}
                        >
                             <View pointerEvents="none" style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
                                {isLocating ? (
                                    <ActivityIndicator color="#94A3B8" />
                               ) : (
                                    <Navigation size={20} color="white" />
                                )}
                                <Text style={[
                                    styles.startButtonText,
                                    isLocating && {color: '#94A3B8'}
                                ]}>
                                    {isLocating ? 'Verifying Location...' : 'Start New Trip'}
                                </Text>
                             </View>
                        </TouchableOpacity>

                        <Text style={[styles.disclaimer, {color: theme.textSecondary}]}>
                            * New trip requires location access. Starting a new trip will reset the current counter for this session.
                        </Text>
                    </BlurView>

                    {/* Toast Notification */}
                    {showToast && (
                        <Animated.View 
                            style={[
                                styles.toastContainer, 
                                { 
                                    opacity: toastOpacity,
                                    transform: [{ translateY: toastTranslate }]
                                }
                            ]}
                        >
                            <BlurView intensity={90} tint={colorScheme === 'dark' ? 'light' : 'dark'} style={[styles.toastContent, {backgroundColor: colorScheme === 'dark' ? 'rgba(255,255,255,0.9)' : 'rgba(15, 23, 42, 0.9)'}]}>
                                <View style={styles.activeIconCircleSmall}>
                                    <ShieldCheck size={16} color="white" />
                                </View>
                                <View>
                                    <Text style={[styles.toastTitle, {color: colorScheme === 'dark' ? '#0F172A' : 'white'}]}>Trip Started!</Text>
                                    <Text style={[styles.toastMessage, {color: colorScheme === 'dark' ? '#64748B' : '#94A3B8'}]}>Now exploring {currentLocation}</Text>
                                </View>
                            </BlurView>
                        </Animated.View>
                    )}
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}

// Shared styles for shadow/glass that can't be inline
const THEME_STYLES = StyleSheet.create({
    glass: {
        borderWidth: 1,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 20,
        elevation: 10,
    }
});

const styles = StyleSheet.create({
    container: {
        flex: 1,
        // backgroundColor set dynamically
    },
    backgroundContainer: {
        ...StyleSheet.absoluteFillObject,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 32,
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: '#1E293B',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1, // Added for consistent look
        alignItems: 'center',
        justifyContent: 'center',
    },
    mainCard: {
        borderRadius: 40,
        padding: 32,
        alignItems: 'center',
        marginBottom: 24,
        overflow: 'hidden',
    },
    shieldIconContainer: {
        padding: 16,
        backgroundColor: '#DCFCE7',
        borderRadius: 24,
        marginBottom: 16,
    },
    bigCount: {
        fontSize: 56,
        fontWeight: '900',
        color: '#1E293B',
        marginBottom: 8,
    },
    statDescription: {
        fontSize: 14,
        color: '#64748B',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
    },
    globalLink: {
        width: '100%',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 24,
        borderTopWidth: 1,
        borderTopColor: 'rgba(241, 245, 249, 0.6)',
    },
    globalLinkText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#94A3B8',
    },
    globalLinkRight: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    globalCountText: {
        fontSize: 14,
        fontWeight: '800',
        color: '#1E293B',
    },
    tripCard: {
        borderRadius: 32,
        padding: 24,
        marginBottom: 24,
        overflow: 'hidden',
    },
    tripHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 16,
        marginBottom: 24,
    },
    mapIconBox: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: '#F0F9FF', // blue-50
        alignItems: 'center',
        justifyContent: 'center',
    },
    tripTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#1E293B',
    },
    tripLocation: {
        fontSize: 12,
        color: '#64748B',
    },
    startButton: {
        width: '100%',
        height: 64,
        borderRadius: 24,
        backgroundColor: '#0F172A', // slate-900
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 10,
        elevation: 5,
        marginBottom: 16,
    },
    startButtonDisabled: {
        backgroundColor: '#F1F5F9',
        shadowOpacity: 0,
    },
    startButtonText: {
        fontSize: 16,
        fontWeight: 'bold',
        color: 'white',
    },
    disclaimer: {
        fontSize: 11,
        color: '#94A3B8',
        textAlign: 'center',
        lineHeight: 16,
    },
    toastContainer: {
        position: 'absolute',
        top: 0,
        left: 20,
        right: 20,
        zIndex: 100,
        alignItems: 'center',
    },
    toastContent: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(15, 23, 42, 0.9)', // Dark slate
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 30,
        gap: 12,
        overflow: 'hidden',
    },
    toastTitle: {
        color: 'white',
        fontWeight: '700',
        fontSize: 14,
    },
    toastMessage: {
        color: '#94A3B8',
        fontSize: 12,
    },
    activeIconCircleSmall: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: '#22C55E',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
