import React, { useEffect, useRef } from 'react';
import { StyleSheet, Animated, Easing, Image } from 'react-native';

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

    const createTiming = (toValue: number, duration: number, easing: (value: number) => number) =>
        Animated.timing(containerOpacity, {
            toValue,
            duration,
            easing,
            useNativeDriver: true,
            isInteraction: false
        });

    // Expose trigger method to parent
    React.useImperativeHandle(ref, () => ({
        trigger: () => {
            if (isAnimating.current) return;
            
            isAnimating.current = true;
            
            // Start the sequence: Show -> Wait 3s -> Hide -> Wait 5s (Cooldown)
            Animated.sequence([
                // 1. Appear
                createTiming(1, 600, Easing.out(Easing.ease)),
                // 2. Stay visible for 3s
                createTiming(1, 3000, Easing.linear),
                // 3. Disappear
                createTiming(0, 600, Easing.in(Easing.ease)),
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
        // Continuous gentle floating motion (always running in background for readiness)
        const createFloat = (anim: Animated.Value, duration: number) => {
            return Animated.loop(
                Animated.sequence([
                    Animated.timing(anim, {
                        toValue: 1,
                        duration: duration,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                        isInteraction: false
                    }),
                    Animated.timing(anim, {
                        toValue: 0,
                        duration: duration,
                        easing: Easing.inOut(Easing.ease),
                        useNativeDriver: true,
                        isInteraction: false
                    })
                ])
            );
        };

        [2000, 2400, 2200].forEach((duration, idx) => {
            createFloat(floatValues[idx], duration).start();
        });

        return () => {
            containerOpacity.stopAnimation();
            floatValues.forEach((anim) => anim.stopAnimation());
        };
    }, []);

    // Interpolate vertical movement
    const transY1 = float1.interpolate({ inputRange: [0, 1], outputRange: [0, -15] });
    const transY2 = float2.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });
    const transY3 = float3.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });
    const floatingItems = [
        { key: 'egg', positionStyle: styles.pos1, translateY: transY1, source: require('../assets/images/allergens/egg.png') },
        { key: 'peanut', positionStyle: styles.pos2, translateY: transY2, source: require('../assets/images/allergens/peanut.png') },
        { key: 'soy', positionStyle: styles.pos3, translateY: transY3, source: require('../assets/images/allergens/soy.png') },
    ];

    return (
        <Animated.View style={[styles.container, { opacity: containerOpacity }]} pointerEvents="none">
            {floatingItems.map((item) => (
                <Animated.View
                    key={item.key}
                    style={[styles.emojiContainer, item.positionStyle, { transform: [{ translateY: item.translateY }] }]}
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
        width: 200,
        height: 200,
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
        width: 60,
        height: 60,
    },
    // Use hardcoded values for 10, 12, 2 o'clock positions relative to 200x200 container
    // Center is (100, 100)
    pos1: { // 12 o'clock (Egg) - Top Center
        top: 0,
        left: 70, // 100 - 30 (half)
    },
    pos2: { // 10 o'clock (Peanut) - Top Left
        top: 30,
        left: 20,
    },
    pos3: { // 2 o'clock (Soy) - Top Right
        top: 30,
        right: 20,
    }
});
