import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image } from 'react-native';

export interface FloatingEmojisHandle {
    trigger: () => void;
}

export const FloatingEmojis = React.forwardRef<FloatingEmojisHandle, {}>((props, ref) => {
    // Opacity for the entire container (Show/Hide cycle)
    const containerOpacity = useRef(new Animated.Value(0)).current;
    
    // Float animations (Always running or synced)
    const float1 = useRef(new Animated.Value(0)).current;
    const float2 = useRef(new Animated.Value(0)).current;
    const float3 = useRef(new Animated.Value(0)).current;

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
                Animated.timing(containerOpacity, {
                    toValue: 1,
                    duration: 600,
                    easing: Easing.out(Easing.ease),
                    useNativeDriver: true,
                    isInteraction: false
                }),
                // 2. Stay visible for 3s
                Animated.timing(containerOpacity, {
                    toValue: 1,
                    duration: 3000,
                    easing: Easing.linear,
                    useNativeDriver: true,
                    isInteraction: false
                }),
                // 3. Disappear
                Animated.timing(containerOpacity, {
                    toValue: 0,
                    duration: 600,
                    easing: Easing.in(Easing.ease),
                    useNativeDriver: true,
                    isInteraction: false
                }),
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

        createFloat(float1, 2000).start();
        createFloat(float2, 2400).start();
        createFloat(float3, 2200).start();

        return () => {
            containerOpacity.stopAnimation();
            float1.stopAnimation();
            float2.stopAnimation();
            float3.stopAnimation();
        };
    }, []);

    // Interpolate vertical movement
    const transY1 = float1.interpolate({ inputRange: [0, 1], outputRange: [0, -15] });
    const transY2 = float2.interpolate({ inputRange: [0, 1], outputRange: [0, -20] });
    const transY3 = float3.interpolate({ inputRange: [0, 1], outputRange: [0, -12] });

    return (
        <Animated.View style={[styles.container, { opacity: containerOpacity }]} pointerEvents="none">
            {/* Top Center (12 o'clock): Egg */}
            <Animated.View style={[styles.emojiContainer, styles.pos1, { transform: [{ translateY: transY1 }] }]}>
                <Image 
                    source={require('../assets/images/allergens/egg.png')} 
                    style={styles.emojiImage}
                    resizeMode="contain"
                />
            </Animated.View>

            {/* Top Left (10 o'clock): Peanut */}
            <Animated.View style={[styles.emojiContainer, styles.pos2, { transform: [{ translateY: transY2 }] }]}>
                <Image 
                    source={require('../assets/images/allergens/peanut.png')} 
                    style={styles.emojiImage}
                    resizeMode="contain"
                />
            </Animated.View>

            {/* Top Right (2 o'clock): Soy */}
            <Animated.View style={[styles.emojiContainer, styles.pos3, { transform: [{ translateY: transY3 }] }]}>
                <Image 
                    source={require('../assets/images/allergens/soy.png')} 
                    style={styles.emojiImage}
                    resizeMode="contain"
                />
            </Animated.View>
        </Animated.View>
    );
}); // Close forwardRef

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
