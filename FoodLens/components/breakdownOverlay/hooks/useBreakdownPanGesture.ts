import { useRef } from 'react';
import { Animated, PanResponder } from 'react-native';
import { DISMISS_THRESHOLD, SCREEN_HEIGHT } from '../constants';

export const useBreakdownPanGesture = (onClose: () => void) => {
    const translateY = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(1)).current;

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy > 0) {
                    translateY.setValue(gestureState.dy);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > DISMISS_THRESHOLD || gestureState.vy > 0.5) {
                    // Dismiss with spring animation that incorporates velocity
                    Animated.spring(translateY, {
                        toValue: SCREEN_HEIGHT,
                        velocity: gestureState.vy,
                        tension: 65,
                        friction: 10,
                        useNativeDriver: true,
                    }).start(() => {
                        onClose();
                    });
                } else {
                    Animated.spring(translateY, {
                        toValue: 0,
                        useNativeDriver: true,
                    }).start();
                    // Reset opacity via its own spring to ensure consistency if it were ever moved manually
                    Animated.spring(opacity, {
                        toValue: 1,
                        useNativeDriver: true,
                    }).start();
                }
            },
        })
    ).current;

    return { translateY, opacity, panResponder };
};
