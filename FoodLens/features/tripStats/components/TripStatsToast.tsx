import React from 'react';
import { Animated, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { ShieldCheck } from 'lucide-react-native';
import { tripStatsStyles as styles } from '../styles/tripStatsStyles';

type TripStatsToastProps = {
    visible: boolean;
    currentLocation: string | null;
    colorScheme: 'light' | 'dark';
    toastOpacity: Animated.Value;
    toastTranslate: Animated.Value;
};

export default function TripStatsToast({
    visible,
    currentLocation,
    colorScheme,
    toastOpacity,
    toastTranslate,
}: TripStatsToastProps) {
    if (!visible) return null;

    return (
        <Animated.View
            style={[
                styles.toastContainer,
                {
                    opacity: toastOpacity,
                    transform: [{ translateY: toastTranslate }],
                },
            ]}
        >
            <BlurView
                intensity={90}
                tint={colorScheme === 'dark' ? 'light' : 'dark'}
                style={[
                    styles.toastContent,
                    {
                        backgroundColor:
                            colorScheme === 'dark' ? 'rgba(255,255,255,0.9)' : 'rgba(15, 23, 42, 0.9)',
                    },
                ]}
            >
                <View style={styles.activeIconCircleSmall}>
                    <ShieldCheck size={16} color="white" />
                </View>
                <View>
                    <Text style={[styles.toastTitle, { color: colorScheme === 'dark' ? '#0F172A' : 'white' }]}>Trip Started!</Text>
                    <Text
                        style={[
                            styles.toastMessage,
                            { color: colorScheme === 'dark' ? '#64748B' : '#94A3B8' },
                        ]}
                    >
                        Now exploring {currentLocation}
                    </Text>
                </View>
            </BlurView>
        </Animated.View>
    );
}
