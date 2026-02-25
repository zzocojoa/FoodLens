import React from 'react';
import { Platform, Text, View } from 'react-native';
import { Image } from 'expo-image';
import Animated from 'react-native-reanimated';
import { useSpatialAppleMotion } from './spatialApple/hooks/useSpatialAppleMotion';
import { spatialAppleStyles as styles } from './spatialApple/styles';
import { SpatialAppleProps } from './spatialApple/types';
import { getEmojiImageUri } from './spatialApple/emojiImage';

/**
 * Spatial Parallax Apple
 * 
 * Uses device gyroscope to create a 3D depth effect (Apple Spatial UI style).
 * Composed of multiple layers moving at different speeds.
 */
export default function SpatialApple({ size = 100, emoji = '🍎', onMotionDetect }: SpatialAppleProps) {
    const { animatedStyle, glowStyle, highlightStyle } = useSpatialAppleMotion(emoji, onMotionDetect);
    const emojiFontSize = size * 0.8;
    const emojiImageSize = size * 0.8;
    const emojiLineHeight = Platform.OS === 'android' ? Math.round(emojiFontSize * 1.08) : undefined;
    const emojiImageUri = React.useMemo(() => getEmojiImageUri(emoji), [emoji]);
    const [imageLoadFailed, setImageLoadFailed] = React.useState(false);

    React.useEffect(() => {
      setImageLoadFailed(false);
    }, [emojiImageUri]);

    return (
        <View style={[styles.container, { width: size, height: size }]}>
            {/* Layer 1: Glow / Shadow (Deepest) */}
            <Animated.View style={[styles.glow, glowStyle]} />
            
            {/* Layer 2: Main Apple Shape */}
            <Animated.View style={[styles.appleContainer, animatedStyle]}>
                 {emojiImageUri && !imageLoadFailed ? (
                   <Image
                     source={{ uri: emojiImageUri }}
                     contentFit="contain"
                     cachePolicy="memory-disk"
                     style={{ width: emojiImageSize, height: emojiImageSize }}
                     onError={() => setImageLoadFailed(true)}
                   />
                 ) : (
                   <Text
                     style={[
                       styles.emoji,
                       {
                         fontSize: emojiFontSize,
                         lineHeight: emojiLineHeight,
                       },
                     ]}
                   >
                     {emoji}
                   </Text>
                 )}
            </Animated.View>

            {/* Layer 3: Specular Highlight (Front) */}
            <Animated.View style={[styles.highlight, highlightStyle]}>
                <View style={[styles.shine, { width: size * 0.3, height: size * 0.15 }]} />
            </Animated.View>
        </View>
    );
}
