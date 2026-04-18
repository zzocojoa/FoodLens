import React from 'react';
import { Animated as RNAnimated, PanResponder } from 'react-native';

const SHEET_INITIAL_Y = 800;
const CLOSE_THRESHOLD_Y = 120;
const CLOSE_THRESHOLD_VY = 0.5;
const SHEET_SPRING_CONFIG = { useNativeDriver: true, friction: 8, tension: 40 } as const;

type UseSheetGestureOptions = {
    animateOnOpen: boolean;
    animateOnClose: boolean;
};

export const useModalSheetGesture = (
    onCloseComplete: () => void,
    options: UseSheetGestureOptions,
) => {
    const panY = React.useRef(new RNAnimated.Value(SHEET_INITIAL_Y)).current;

    const closeSheet = React.useCallback(() => {
        panY.stopAnimation();
        if (!options.animateOnClose) {
            panY.setValue(SHEET_INITIAL_Y);
            onCloseComplete();
            return;
        }
        RNAnimated.timing(panY, {
            toValue: SHEET_INITIAL_Y,
            duration: 250,
            useNativeDriver: true,
        }).start(({ finished }) => {
            if (finished) {
                onCloseComplete();
            }
        });
    }, [onCloseComplete, options.animateOnClose, panY]);

    const openSheet = React.useCallback(() => {
        panY.stopAnimation();
        if (!options.animateOnOpen) {
            panY.setValue(0);
            return;
        }
        panY.setValue(SHEET_INITIAL_Y);
        RNAnimated.spring(panY, {
            toValue: 0,
            ...SHEET_SPRING_CONFIG,
            }).start();
    }, [options.animateOnOpen, panY]);

    const panResponder = React.useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gestureState) =>
                Math.abs(gestureState.dy) > 6 && Math.abs(gestureState.dx) < 10,
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
