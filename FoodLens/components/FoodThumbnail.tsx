import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, StyleProp, ViewStyle, ImageStyle } from 'react-native';

interface FoodThumbnailProps {
    uri?: string;
    emoji: string;
    style?: StyleProp<ViewStyle>;
    imageStyle?: StyleProp<ImageStyle>;
    fallbackFontSize?: number;
}

export const FoodThumbnail = ({ 
    uri, 
    emoji, 
    style, 
    imageStyle,
    fallbackFontSize = 24
}: FoodThumbnailProps) => {
    const [hasError, setHasError] = useState(false);

    // If no URI or previous error, show Emoji
    if (!uri || hasError) {
        return (
            <View style={[styles.container, style]}>
                <Text style={{ fontSize: fallbackFontSize }}>{emoji}</Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, style]}>
             <Image 
                source={{ uri }} 
                style={[styles.image, imageStyle]}
                resizeMode="cover"
                onError={() => setHasError(true)}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
        overflow: 'hidden', // Ensure image respects border radius of container
    },
    image: {
        width: '100%',
        height: '100%',
    }
});
