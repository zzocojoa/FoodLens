import React from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { ShieldCheck } from 'lucide-react-native';
import {
    tripStatsDashboardColors as colors,
    tripStatsDashboardRadii as radii,
    tripStatsDashboardSpacing as spacing,
    tripStatsDashboardTypography as typography,
} from './tripStatsDashboardTokens';
import { useI18n } from '@/features/i18n';

type TripStatsToastProps = {
    currentLocation: string | null;
    insetsTop: number;
    onHidden: () => void;
};

export default function TripStatsToast({
    currentLocation,
    insetsTop,
    onHidden,
}: TripStatsToastProps) {
    const { t } = useI18n();
    const toastOpacity = React.useRef(new Animated.Value(0)).current;
    const toastTranslate = React.useRef(new Animated.Value(-50)).current;
    const hideTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

    React.useEffect(() => {
        if (currentLocation === null) {
            return;
        }

        toastOpacity.setValue(0);
        toastTranslate.setValue(-50);

        Animated.parallel([
            Animated.timing(toastOpacity, {
                toValue: 1,
                duration: 300,
                easing: Easing.out(Easing.ease),
                useNativeDriver: true,
            }),
            Animated.timing(toastTranslate, {
                toValue: insetsTop + 10,
                duration: 420,
                easing: Easing.out(Easing.back(1.2)),
                useNativeDriver: true,
            }),
        ]).start();

        hideTimerRef.current = setTimeout(() => {
            Animated.parallel([
                Animated.timing(toastOpacity, {
                    toValue: 0,
                    duration: 320,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(toastTranslate, {
                    toValue: -50,
                    duration: 320,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ]).start(() => {
                onHidden();
            });
        }, 2800);

        return () => {
            if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current);
                hideTimerRef.current = null;
            }
        };
    }, [currentLocation, insetsTop, onHidden, toastOpacity, toastTranslate]);

    if (currentLocation === null) return null;

    return (
        <Animated.View
            pointerEvents="none"
            style={[
                styles.toastContainer,
                {
                    opacity: toastOpacity,
                    transform: [{ translateY: toastTranslate }],
                },
            ]}
        >
            <View style={styles.toastContent}>
                <View style={styles.activeIconCircleSmall}>
                    <ShieldCheck size={16} color="white" />
                </View>
                <View style={styles.toastCopy}>
                    <Text style={styles.toastTitle}>
                        {t('tripStats.toast.startedTitle', 'Trip started!')}
                    </Text>
                    <Text style={styles.toastMessage}>
                        {t('tripStats.toast.nowExploringTemplate', 'Now exploring {location}').replace(
                            '{location}',
                            currentLocation ?? t('tripStats.hero.locationNotSet', 'Location not set')
                        )}
                    </Text>
                </View>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    toastContainer: {
        left: spacing.xl,
        position: 'absolute',
        right: spacing.xl,
        top: 0,
        zIndex: 100,
    },
    toastContent: {
        alignItems: 'center',
        backgroundColor: colors.surfaceStrong,
        borderColor: colors.lineStrong,
        borderCurve: 'continuous',
        borderRadius: radii.md,
        borderWidth: 1,
        boxShadow: '0 18px 40px rgba(23, 32, 51, 0.16)',
        flexDirection: 'row',
        gap: spacing.sm,
        minHeight: 64,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
    },
    activeIconCircleSmall: {
        alignItems: 'center',
        backgroundColor: colors.accentGreen,
        borderRadius: 999,
        height: 32,
        justifyContent: 'center',
        width: 32,
    },
    toastCopy: {
        flex: 1,
        gap: 2,
    },
    toastTitle: {
        color: colors.accentGreen,
        fontSize: typography.caption,
        fontWeight: '800',
        letterSpacing: 0.5,
        lineHeight: 16,
        textTransform: 'uppercase',
    },
    toastMessage: {
        color: colors.ink,
        fontSize: typography.bodyStrong,
        fontWeight: '700',
        lineHeight: 18,
    },
});
