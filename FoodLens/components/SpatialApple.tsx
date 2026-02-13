import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, { 
    useSharedValue, 
    useAnimatedStyle, 
    withSpring, 
    SensorType,
    useAnimatedSensor,
    useDerivedValue,
    useAnimatedReaction,
    runOnJS
} from 'react-native-reanimated';
import {
    APPLE_SPRING_CONFIG,
    GLOW_COLORS,
    GLOW_SPRING_CONFIG,
    MOTION_THRESHOLD,
    OFFSET_DECAY,
    OFFSET_LIMIT,
    SENSOR_SENSITIVITY,
} from './spatialApple/constants';
import { clamp } from './spatialApple/utils';

interface SpatialAppleProps {
    size?: number;
    emoji?: string;
    onMotionDetect?: () => void;
}

/**
 * Spatial Parallax Apple
 * 
 * Uses device gyroscope to create a 3D depth effect (Apple Spatial UI style).
 * Composed of multiple layers moving at different speeds.
 */
export default function SpatialApple({ size = 100, emoji = '🍎', onMotionDetect }: SpatialAppleProps) {
    // Use GYROSCOPE to get rotational velocity (rad/s) instead of absolute angle
    // This allows us to react to movement but always return to center
    const sensor = useAnimatedSensor(SensorType.GYROSCOPE, { interval: 20 });
    
    // Virtual position values
    const offsetX = useSharedValue(0);
    const offsetY = useSharedValue(0);
    
    // Determine glow color based on emoji, fallback to Rose-500
    const glowColor = GLOW_COLORS[emoji] || '#F43F5E';

    useDerivedValue(() => {
        // Integrate velocity to get position (approximated)
        // Tune sensitivity: Lower value = Heavier object (slower response)
        const velocityX = sensor.sensor.value.y * SENSOR_SENSITIVITY; 
        const velocityY = sensor.sensor.value.x * SENSOR_SENSITIVITY;

        // Cumulative calculation with decay
        // Decay 0.97: Very low friction, slides for a long time (slow return)
        offsetX.value = clamp((offsetX.value + velocityX) * OFFSET_DECAY, -OFFSET_LIMIT, OFFSET_LIMIT);
        offsetY.value = clamp((offsetY.value + velocityY) * OFFSET_DECAY, -OFFSET_LIMIT, OFFSET_LIMIT);
        
        return offsetX.value;
    });

    useAnimatedReaction(
        () => Math.abs(offsetX.value) + Math.abs(offsetY.value),
        (magnitude) => {
            // Threshold for "significant motion"
            if (magnitude > MOTION_THRESHOLD && onMotionDetect) {
                runOnJS(onMotionDetect)();
            }
        },
        [onMotionDetect] // Dependency
    );

    const animatedStyle = useAnimatedStyle(() => {
        return {
            transform: [
                // High mass = Heavier object = Slower movement
                { translateX: withSpring(offsetX.value, APPLE_SPRING_CONFIG) },
                { translateY: withSpring(offsetY.value, APPLE_SPRING_CONFIG) }
            ]
        };
    });

    const glowStyle = useAnimatedStyle(() => {
        return {
            transform: [
                // Background moves slower/heavier than foreground for depth
                // mass: 3.5, stiffness: 50
                { translateX: withSpring(-offsetX.value * SENSOR_SENSITIVITY, GLOW_SPRING_CONFIG) },
                { translateY: withSpring(-offsetY.value * SENSOR_SENSITIVITY, GLOW_SPRING_CONFIG) },
                { scale: 1.2 }
            ],
            opacity: 0.6,
            backgroundColor: glowColor // Dynamic Color
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
                 <Text style={[styles.emoji, { fontSize: size * 0.8 }]}>{emoji}</Text>
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
        // @ts-ignore
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
