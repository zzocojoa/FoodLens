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
                    opacity.setValue(1 - gestureState.dy / 500);
                }
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > DISMISS_THRESHOLD) {
                    Animated.timing(translateY, {
                        toValue: SCREEN_HEIGHT,
                        duration: 300,
                        useNativeDriver: true,
                    }).start(() => {
                        onClose();
                        translateY.setValue(0);
                        opacity.setValue(1);
                    });
                } else {
                    Animated.spring(translateY, {
                        toValue: 0,
                        useNativeDriver: true,
                    }).start();
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
