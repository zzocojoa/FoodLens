import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Easing, Image } from 'react-native';
import {
    FLOAT_DURATIONS,
    FLOATING_EMOJIS_CONTAINER_SIZE,
    FLOATING_EMOJI_SIZE,
    FLOATING_ITEMS,
    FLOATING_POSITIONS,
} from './floatingEmojis/constants';
import { createFloatingLoop, createOpacityTiming } from './floatingEmojis/utils';

export interface FloatingEmojisHandle {
    trigger: () => void;
}

export const FloatingEmojis = React.forwardRef<FloatingEmojisHandle, object>((_props, ref) => {
    // Opacity for the entire container (Show/Hide cycle)
    const containerOpacity = useRef(new Animated.Value(0)).current;
    
    // Float animations (Always running or synced)
    const float1 = useRef(new Animated.Value(0)).current;
    const float2 = useRef(new Animated.Value(0)).current;
    const float3 = useRef(new Animated.Value(0)).current;
    const floatValues = [float1, float2, float3];

    // State to track if animation/cooldown is active
    const isAnimating = useRef(false);

    // Expose trigger method to parent
    React.useImperativeHandle(ref, () => ({
        trigger: () => {
            if (isAnimating.current) return;
            
            isAnimating.current = true;
            
            // Start the sequence: Show -> Wait 3s -> Hide -> Wait 5s (Cooldown)
            Animated.sequence([
                // 1. Appear
                createOpacityTiming(containerOpacity, 1, 600, Easing.out(Easing.ease)),
                // 2. Stay visible for 3s
                createOpacityTiming(containerOpacity, 1, 3000, Easing.linear),
                // 3. Disappear
                createOpacityTiming(containerOpacity, 0, 600, Easing.in(Easing.ease)),
                // 4. Cooldown 5s (Stay hidden)
                Animated.delay(5000) 
            ]).start(({ finished }) => {
                if (finished) {
                    isAnimating.current = false;
                }
            });
        }
    }));

    useEffect(() => {
        FLOAT_DURATIONS.forEach((duration, idx) => {
            createFloatingLoop(floatValues[idx], duration).start();
        });

        return () => {
            containerOpacity.stopAnimation();
            floatValues.forEach((anim) => anim.stopAnimation());
        };
    }, []);

    // Interpolate vertical movement
    const floatingItems = FLOATING_ITEMS.map((item, index) => ({
        ...item,
        translateY: floatValues[index].interpolate({
            inputRange: [0, 1],
            outputRange: item.outputRange,
        }),
    }));

    return (
        <Animated.View style={[styles.container, { opacity: containerOpacity }]} pointerEvents="none">
            {floatingItems.map((item) => (
                <Animated.View
                    key={item.key}
                    style={[
                        styles.emojiContainer,
                        styles[item.positionStyle],
                        { transform: [{ translateY: item.translateY }] },
                    ]}
                >
                    <Image source={item.source} style={styles.emojiImage} resizeMode="contain" />
                </Animated.View>
            ))}
        </Animated.View>
    );
}); // Close forwardRef

FloatingEmojis.displayName = 'FloatingEmojis';

const styles = StyleSheet.create({
    container: {
        position: 'absolute',
        width: FLOATING_EMOJIS_CONTAINER_SIZE,
        height: FLOATING_EMOJIS_CONTAINER_SIZE,
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 0, // Behind the button if needed, or around it
    },
    emojiContainer: {
        position: 'absolute',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    emojiImage: {
        width: FLOATING_EMOJI_SIZE,
        height: FLOATING_EMOJI_SIZE,
    },
    pos1: FLOATING_POSITIONS.topCenter,
    pos2: FLOATING_POSITIONS.topLeft,
    pos3: FLOATING_POSITIONS.topRight,
});
