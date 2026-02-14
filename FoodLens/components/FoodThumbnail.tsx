import React, { useState } from 'react';
import { View, Text, Image, StyleSheet, StyleProp, ViewStyle, ImageStyle } from 'react-native';
const BARCODE_PATTERN = [2, 1, 3, 1, 2, 4, 1, 2];

interface FoodThumbnailProps {
    uri?: string;
    emoji: string;
    style?: StyleProp<ViewStyle>;
    imageStyle?: StyleProp<ImageStyle>;
    fallbackFontSize?: number;
    traceId?: string;
}

export const FoodThumbnail = ({ 
    uri, 
    emoji, 
    style, 
    imageStyle,
    fallbackFontSize = 24,
    traceId
}: FoodThumbnailProps) => {
    const [hasError, setHasError] = useState(false);
    const isBarcodePattern = typeof uri === 'string' && uri.startsWith('barcode://');

    if (isBarcodePattern) {
        return (
            <View style={[styles.container, style, styles.barcodeContainer]}>
                {BARCODE_PATTERN.map((bar, idx) => (
                    <View
                        key={`barcode-mini-${idx}`}
                        style={[
                            styles.barcodeBar,
                            {
                                flex: bar,
                                opacity: idx % 2 === 0 ? 0.95 : 0.75,
                            },
                        ]}
                    />
                ))}
            </View>
        );
    }

    // If no URI or previous error, show Emoji
    if (!uri || hasError) {
        if (!uri) {
            console.log('[FoodThumbnailTrace] fallback:no-uri', { traceId, emoji });
        } else if (hasError) {
            console.log('[FoodThumbnailTrace] fallback:after-error', { traceId, uriHead: uri.slice(0, 48) });
        }
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
                onError={() => {
                    setHasError(true);
                }}
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
    },
    barcodeContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 4,
        paddingVertical: 4,
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: '#E5E7EB',
    },
    barcodeBar: {
        height: '82%',
        backgroundColor: '#111827',
        marginHorizontal: 0.4,
        borderRadius: 0.5,
    },
});
