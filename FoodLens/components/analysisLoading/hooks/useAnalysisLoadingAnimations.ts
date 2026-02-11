import { useEffect } from 'react';
import {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

export function useAnalysisLoadingAnimations() {
    const rotation = useSharedValue(0);
    const pulseScale = useSharedValue(1);
    const rippleScale = useSharedValue(1);
    const rippleOpacity = useSharedValue(0.8);

    useEffect(() => {
        const pulseTimingConfig = { duration: 1000, easing: Easing.inOut(Easing.ease) };
        const rippleTimingConfig = { duration: 3000, easing: Easing.out(Easing.ease) };

        rotation.value = withRepeat(withTiming(360, { duration: 8000, easing: Easing.linear }), -1, false);

        pulseScale.value = withRepeat(
            withSequence(withTiming(1.1, pulseTimingConfig), withTiming(1, pulseTimingConfig)),
            -1,
            true
        );

        rippleScale.value = withRepeat(withTiming(4, rippleTimingConfig), -1, false);
        rippleOpacity.value = withRepeat(withTiming(0, rippleTimingConfig), -1, false);
    }, [pulseScale, rippleOpacity, rippleScale, rotation]);

    const orbitStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `${rotation.value}deg` }],
    }));

    const orbitInnerStyle = useAnimatedStyle(() => ({
        transform: [{ rotate: `-${rotation.value}deg` }],
    }));

    const pulseStyle = useAnimatedStyle(() => ({
        transform: [{ scale: pulseScale.value }],
    }));

    const rippleStyle = useAnimatedStyle(() => ({
        transform: [{ scale: rippleScale.value }],
        opacity: rippleOpacity.value,
    }));

    return {
        orbitStyle,
        orbitInnerStyle,
        pulseStyle,
        rippleStyle,
    };
}
