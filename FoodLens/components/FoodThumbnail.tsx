import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle, ImageStyle } from 'react-native';
import { Image as ExpoImage, type ImageSource } from 'expo-image';
const BARCODE_PATTERN = [2, 1, 3, 1, 2, 4, 1, 2];

const extractMediaRenderAssetId = (uri: string): string | null => {
    try {
        const parsed = new URL(uri);
        const match = parsed.pathname.match(/\/media\/render\/([^/?#]+)/i);
        return match?.[1] || null;
    } catch {
        const withoutQuery = uri.split('?')[0] || uri;
        const match = withoutQuery.match(/\/media\/render\/([^/?#]+)/i);
        return match?.[1] || null;
    }
};

interface FoodThumbnailProps {
    uri?: string;
    emoji: string;
    style?: StyleProp<ViewStyle>;
    imageStyle?: StyleProp<ImageStyle>;
    fallbackFontSize?: number;
    traceId?: string;
}

export const FoodThumbnail = React.memo(function FoodThumbnail({
    uri,
    emoji,
    style,
    imageStyle,
    fallbackFontSize,
}: FoodThumbnailProps): React.JSX.Element {
    const [failedUri, setFailedUri] = useState<string | null>(null);
    const isBarcodePattern = typeof uri === 'string' && uri.startsWith('barcode://');
    const hasError = typeof uri === 'string' && failedUri === uri;
    const resolvedFallbackFontSize = fallbackFontSize ?? 24;
    const resolvedSource = useMemo<ImageSource | null>(() => {
        if (!uri) return null;
        const cacheKey = extractMediaRenderAssetId(uri);
        return cacheKey ? { uri, cacheKey } : { uri };
    }, [uri]);

    useEffect(() => {
        setFailedUri((currentFailedUri) => {
            if (currentFailedUri === null || currentFailedUri === uri) {
                return currentFailedUri;
            }

            return null;
        });
    }, [uri]);

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

    // URI가 없거나 현재 URI 로드에 실패한 경우 emoji fallback을 표시합니다.
    if (!uri || hasError || !resolvedSource) {
        return (
            <View style={[styles.container, style]}>
                <Text style={{ fontSize: resolvedFallbackFontSize }}>{emoji}</Text>
            </View>
        );
    }

    return (
        <View style={[styles.container, style]}>
            <ExpoImage
                recyclingKey={uri}
                source={resolvedSource}
                style={[styles.image, imageStyle]}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={100}
                onError={() => {
                    setFailedUri(uri);
                }}
            />
        </View>
    );
});

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#F8FAFC',
        overflow: 'hidden', // 이미지가 컨테이너 radius 밖으로 넘치지 않게 합니다.
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
