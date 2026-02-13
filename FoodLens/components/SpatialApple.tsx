import React from 'react';
import { View, Text } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSpatialAppleMotion } from './spatialApple/hooks/useSpatialAppleMotion';
import { spatialAppleStyles as styles } from './spatialApple/styles';
import { SpatialAppleProps } from './spatialApple/types';

/**
 * Spatial Parallax Apple
 * 
 * Uses device gyroscope to create a 3D depth effect (Apple Spatial UI style).
 * Composed of multiple layers moving at different speeds.
 */
export default function SpatialApple({ size = 100, emoji = '🍎', onMotionDetect }: SpatialAppleProps) {
    const { animatedStyle, glowStyle, highlightStyle } = useSpatialAppleMotion(emoji, onMotionDetect);

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
