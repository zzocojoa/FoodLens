import React from 'react';
import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import TripStatsHeader from '../components/TripStatsHeader';
import TripStatsMainCard from '../components/TripStatsMainCard';
import TripStatsToast from '../components/TripStatsToast';
import TripStatsTripCard from '../components/TripStatsTripCard';
import { useTripStatsScreen } from '../hooks/useTripStatsScreen';
import { tripStatsStyles as styles } from '../styles/tripStatsStyles';

export default function TripStatsScreen() {
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const colorScheme = useColorScheme() ?? 'light';
    const theme = Colors[colorScheme];

    const {
        loading,
        safeCount,
        totalCount,
        currentLocation,
        isLocating,
        tripStartDate,
        showToast,
        toastOpacity,
        toastTranslate,
        handleStartNewTrip,
    } = useTripStatsScreen(insets.top);

    return (
        <View style={[styles.container, { backgroundColor: theme.background }]}>
            <View style={styles.backgroundContainer} />

            <SafeAreaView style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 40, paddingHorizontal: 24, paddingTop: 16 }}
                    showsVerticalScrollIndicator={false}
                >
                    <TripStatsHeader theme={theme} onBack={() => router.back()} />

                    <TripStatsMainCard
                        loading={loading}
                        safeCount={safeCount}
                        totalCount={totalCount}
                        tripStartDate={tripStartDate}
                        colorScheme={colorScheme}
                        theme={theme}
                        onPressGlobalRecord={() => router.push('/history')}
                    />

                    <TripStatsTripCard
                        currentLocation={currentLocation}
                        isLocating={isLocating}
                        colorScheme={colorScheme}
                        theme={theme}
                        onStartNewTrip={handleStartNewTrip}
                    />

                    <TripStatsToast
                        visible={showToast}
                        currentLocation={currentLocation}
                        colorScheme={colorScheme}
                        toastOpacity={toastOpacity}
                        toastTranslate={toastTranslate}
                    />
                </ScrollView>
            </SafeAreaView>
        </View>
    );
}
