import React from 'react';
import { Animated as RNAnimated, PanResponder } from 'react-native';

export const useSheetGesture = (onCloseComplete: () => void) => {
    const panY = React.useRef(new RNAnimated.Value(800)).current;

    const closeSheet = React.useCallback(() => {
        RNAnimated.timing(panY, {
            toValue: 800,
            duration: 250,
            useNativeDriver: true,
        }).start(onCloseComplete);
    }, [onCloseComplete, panY]);

    const openSheet = React.useCallback(() => {
        panY.setValue(800);
        RNAnimated.spring(panY, {
            toValue: 0,
            useNativeDriver: true,
            friction: 8,
            tension: 40,
            }).start();
    }, [panY]);

    const panResponder = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gestureState) =>
                gestureState.dy > 10 && Math.abs(gestureState.dx) < 10,
            onPanResponderMove: (_, gestureState) => {
                if (gestureState.dy >= 0) panY.setValue(gestureState.dy);
            },
            onPanResponderRelease: (_, gestureState) => {
                if (gestureState.dy > 120 || gestureState.vy > 0.5) {
                    closeSheet();
                } else {
                    RNAnimated.spring(panY, {
                        toValue: 0,
                        useNativeDriver: true,
                        friction: 8,
                        tension: 40,
                    }).start();
                }
            },
        })
    ).current;

    return { panY, panResponder, openSheet, closeSheet };
};
