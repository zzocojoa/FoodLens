import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import { MapPin, Navigation } from 'lucide-react-native';
import { BlurView } from 'expo-blur';
import { TripStatsTheme } from '../types/tripStats.types';
import { THEME_STYLES, tripStatsStyles as styles } from '../styles/tripStatsStyles';
import { useI18n } from '@/features/i18n';

type TripStatsTripCardProps = {
    currentLocation: string | null;
    isLocating: boolean;
    colorScheme: 'light' | 'dark';
    theme: TripStatsTheme;
    onStartNewTrip: () => void;
};

export default function TripStatsTripCard({
    currentLocation,
    isLocating,
    colorScheme,
    theme,
    onStartNewTrip,
}: TripStatsTripCardProps) {
    const { t } = useI18n();

    return (
        <BlurView
            intensity={70}
            tint={colorScheme === 'dark' ? 'dark' : 'light'}
            style={[
                styles.tripCard,
                { backgroundColor: theme.glass, borderColor: theme.glassBorder },
                THEME_STYLES.glass,
            ]}
        >
            <View style={styles.tripHeader}>
                <View style={[styles.mapIconBox, { backgroundColor: theme.surface }]}>
                    <MapPin size={24} color="#3B82F6" />
                </View>
                <View>
                    <Text style={[styles.tripTitle, { color: theme.textPrimary }]}>
                        {t('tripStats.trip.currentTrip', 'Current Trip')}
                    </Text>
                    <Text style={[styles.tripLocation, { color: theme.textSecondary }]}>
                        {currentLocation || t('tripStats.trip.locationNotSet', 'Location not set')}
                    </Text>
                </View>
            </View>

            <TouchableOpacity
                onPress={onStartNewTrip}
                disabled={isLocating}
                activeOpacity={0.8}
                style={[styles.startButton, isLocating && styles.startButtonDisabled]}
            >
                <View pointerEvents="none" style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {isLocating ? <ActivityIndicator color="#94A3B8" /> : <Navigation size={20} color="white" />}
                    <Text style={[styles.startButtonText, isLocating && { color: '#94A3B8' }]}>
                        {isLocating
                            ? t('tripStats.trip.verifyingLocation', 'Verifying Location...')
                            : t('tripStats.trip.startNew', 'Start New Trip')}
                    </Text>
                </View>
            </TouchableOpacity>

            <Text style={[styles.disclaimer, { color: theme.textSecondary }]}>
                {t(
                    'tripStats.trip.disclaimer',
                    '* New trip requires location access. Starting a new trip will reset the current counter for this session.'
                )}
            </Text>
        </BlurView>
    );
}
