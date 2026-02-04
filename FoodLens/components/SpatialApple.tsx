import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import Animated, { 
    useSharedValue, 
    useAnimatedStyle, 
    withSpring, 
    interpolate,
    SensorType,
    useAnimatedSensor,
    useDerivedValue
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';

interface SpatialAppleProps {
    size?: number;
}

/**
 * Spatial Parallax Apple
 * 
 * Uses device gyroscope to create a 3D depth effect (Apple Spatial UI style).
 * Composed of multiple layers moving at different speeds.
 */
// Helper to clamp values
const clamp = (value: number, min: number, max: number) => {
    'worklet';
    return Math.min(Math.max(value, min), max);
};

export default function SpatialApple({ size = 100 }: SpatialAppleProps) {
    // Use GYROSCOPE to get rotational velocity (rad/s) instead of absolute angle
    // This allows us to react to movement but always return to center
    const sensor = useAnimatedSensor(SensorType.GYROSCOPE, { interval: 20 });
    
    // Virtual position values
    const offsetX = useSharedValue(0);
    const offsetY = useSharedValue(0);

    useDerivedValue(() => {
        // Integrate velocity to get position (approximated)
        // Tune sensitivity: Lower value = Heavier object (slower response)
        const velocityX = sensor.sensor.value.y * 1.5; 
        const velocityY = sensor.sensor.value.x * 1.5;

        // Cumulative calculation with decay
        // Decay 0.97: Very low friction, slides for a long time (slow return)
        offsetX.value = clamp((offsetX.value + velocityX) * 0.9, -20, 20);
        offsetY.value = clamp((offsetY.value + velocityY) * 0.9, -20, 20);
        
        return offsetX.value;
    });

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [
                // High mass = Heavier object = Slower movement
                { translateX: withSpring(offsetX.value, { mass: 4.0, damping: 30, stiffness: 30 }) },
                { translateY: withSpring(offsetY.value, { mass: 4.0, damping: 30, stiffness: 30 }) }
            ]
        };
    });

    const glowStyle = useAnimatedStyle(() => {
        return {
            transform: [
                // Background moves slower/heavier than foreground for depth
                // mass: 3.5, stiffness: 50
                { translateX: withSpring(-offsetX.value * 1.5, { mass: 3.5, damping: 35, stiffness: 50 }) },
                { translateY: withSpring(-offsetY.value * 1.5, { mass: 3.5, damping: 35, stiffness: 50 }) },
                { scale: 1.2 }
            ],
            opacity: 0.6
        };
    });

    const highlightStyle = useAnimatedStyle(() => {
        return {
            transform: [
                { translateX: offsetX.value * 1.2 },
                { translateY: offsetY.value * 1.2 }
            ]
        };
    });

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            {/* Layer 1: Glow / Shadow (Deepest) */}
            <Animated.View style={[styles.glow, glowStyle]} />
            
            {/* Layer 2: Main Apple Shape */}
            <Animated.View style={[styles.appleContainer, animatedStyle]}>
                 <Text style={[styles.emoji, { fontSize: size * 0.8 }]}>🍎</Text>
            </Animated.View>

            {/* Layer 3: Specular Highlight (Front) */}
            <Animated.View style={[styles.highlight, highlightStyle]}>
                <View style={[styles.shine, { width: size * 0.3, height: size * 0.15 }]} />
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10,
    },
    appleContainer: {
        zIndex: 2,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.3,
        shadowRadius: 10,
    },
    emoji: {
        textAlign: 'center',
    },
    glow: {
        position: 'absolute',
        width: '80%',
        height: '80%',
        backgroundColor: '#F43F5E', // Rose-500
        borderRadius: 100,
        zIndex: 1,
        filter: 'blur(20px)', // Web compatibility
    },
    highlight: {
        position: 'absolute',
        top: '15%',
        right: '20%',
        zIndex: 3,
    },
    shine: {
        backgroundColor: 'rgba(255, 255, 255, 0.4)',
        borderRadius: 20,
        transform: [{ rotate: '-45deg' }],
    }
});
