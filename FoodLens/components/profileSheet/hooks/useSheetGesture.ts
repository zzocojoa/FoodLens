import React from 'react';
import { Animated as RNAnimated, PanResponder } from 'react-native';

const SHEET_INITIAL_Y = 800;
const CLOSE_THRESHOLD_Y = 120;
const CLOSE_THRESHOLD_VY = 0.5;
const SHEET_SPRING_CONFIG = { useNativeDriver: true, friction: 8, tension: 40 } as const;

export const useSheetGesture = (onCloseComplete: () => void) => {
    const panY = React.useRef(new RNAnimated.Value(SHEET_INITIAL_Y)).current;

    const closeSheet = React.useCallback(() => {
        RNAnimated.timing(panY, {
            toValue: SHEET_INITIAL_Y,
            duration: 250,
            useNativeDriver: true,
        }).start(onCloseComplete);
    }, [onCloseComplete, panY]);

    const openSheet = React.useCallback(() => {
        panY.setValue(SHEET_INITIAL_Y);
        RNAnimated.spring(panY, {
            toValue: 0,
            ...SHEET_SPRING_CONFIG,
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
                if (gestureState.dy > CLOSE_THRESHOLD_Y || gestureState.vy > CLOSE_THRESHOLD_VY) {
                    closeSheet();
                } else {
                    RNAnimated.spring(panY, {
                        toValue: 0,
                        ...SHEET_SPRING_CONFIG,
                    }).start();
                }
            },
        })
    ).current;

    return { panY, panResponder, openSheet, closeSheet };
};
