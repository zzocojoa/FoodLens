import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

export function useTripStartToast(insetsTop: number) {
    const [showToast, setShowToast] = useState(false);
    const toastOpacity = useRef(new Animated.Value(0)).current;
    const toastTranslate = useRef(new Animated.Value(-50)).current;
    const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const triggerToast = useCallback(() => {
        setShowToast(true);

        const animate = (value: Animated.Value, toValue: number, duration: number, easing?: (value: number) => number) =>
            Animated.timing(value, { toValue, duration, useNativeDriver: true, easing });

        Animated.parallel([
            animate(toastOpacity, 1, 300),
            animate(toastTranslate, insetsTop + 10, 400, Easing.out(Easing.back(1.5))),
        ]).start();

        if (hideTimerRef.current) {
            clearTimeout(hideTimerRef.current);
        }

        hideTimerRef.current = setTimeout(() => {
            Animated.parallel([
                animate(toastOpacity, 0, 300),
                animate(toastTranslate, -50, 300),
            ]).start(() => setShowToast(false));
        }, 4000);
    }, [insetsTop, toastOpacity, toastTranslate]);

    useEffect(() => {
        return () => {
            if (hideTimerRef.current) {
                clearTimeout(hideTimerRef.current);
            }
        };
    }, []);

    return {
        showToast,
        toastOpacity,
        toastTranslate,
        triggerToast,
    };
}
