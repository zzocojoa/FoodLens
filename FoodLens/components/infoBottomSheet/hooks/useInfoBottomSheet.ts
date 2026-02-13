import { useCallback, useEffect, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { SCREEN_HEIGHT, SHEET_EXIT_DURATION_MS } from '../constants';
import { shouldCloseSheet } from '../utils/shouldCloseSheet';

export const useInfoBottomSheet = (isOpen: boolean, onClose: () => void) => {
    const [isVisible, setIsVisible] = useState(isOpen);
    const translateY = useSharedValue(0);

    useEffect(() => {
        if (isOpen) {
            setIsVisible(true);
            translateY.value = 0;
        } else {
            setIsVisible(false);
        }
    }, [isOpen, translateY]);

    const closeSheetFromWorklet = useCallback(() => {
        onClose();
    }, [onClose]);

    const gesture = Gesture.Pan()
        .onChange((event) => {
            if (event.translationY > 0) {
                translateY.value = event.translationY;
            }
        })
        .onEnd((event) => {
            if (shouldCloseSheet(event.translationY, event.velocityY)) {
                translateY.value = withTiming(SCREEN_HEIGHT, { duration: SHEET_EXIT_DURATION_MS }, () => {
                    runOnJS(closeSheetFromWorklet)();
                });
            } else {
                translateY.value = withSpring(0);
            }
        });

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    return {
        isVisible,
        gesture,
        animatedStyle,
    };
};
