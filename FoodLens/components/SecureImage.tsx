import React, { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, StyleProp, ImageStyle } from 'react-native';
import { Image as ExpoImage, type ImageProps, type ImageSource } from 'expo-image';
import { ImageOff } from 'lucide-react-native';

interface SecureImageProps extends ImageProps {
  fallbackIconSize?: number;
  fallbackColor?: string;
  fallbackContainerStyle?: StyleProp<ImageStyle>;
  sharedTransitionTag?: string; // Add this prop
}

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

const toCachedImageSource = (source: ImageProps['source']): ImageProps['source'] => {
  if (!source) return source;
  if (typeof source === 'string') {
    const cacheKey = extractMediaRenderAssetId(source);
    return cacheKey ? ({ uri: source, cacheKey } satisfies ImageSource) : ({ uri: source } satisfies ImageSource);
  }
  if (typeof source === 'number') {
    return source;
  }
  if (Array.isArray(source)) {
    return source;
  }
  if (typeof source === 'object' && source && 'uri' in source && typeof source.uri === 'string') {
    const cacheKey = extractMediaRenderAssetId(source.uri);
    return cacheKey ? { ...source, cacheKey } : source;
  }
  return source;
};

/**
 * SecureImage Component
 * 
 * Wraps React Native Image to handle loading errors (e.g. deleted files) gracefully.
 * Displays a placeholder icon instead of a broken image.
 * Supports Reanimated sharedTransitionTag.
 */
export const SecureImage: React.FC<SecureImageProps> = ({ 
  source, 
  style, 
  fallbackIconSize = 24,
  fallbackColor = '#94A3B8',
  fallbackContainerStyle,
  sharedTransitionTag: _sharedTransitionTag,
  ...props 
}) => {
  const [hasError, setHasError] = useState(false);
  const [imageSource, setImageSource] = useState(source);
  const resolvedSource = useMemo(() => toCachedImageSource(imageSource), [imageSource]);

  useEffect(() => {
    setHasError(false);
    setImageSource(source);
  }, [source]);

  if (hasError) {
    return (
      <View style={[styles.fallbackContainer, style, fallbackContainerStyle]}>
        <ImageOff size={fallbackIconSize} color={fallbackColor} />
      </View>
    );
  }

  return (
    <ExpoImage
      {...props}
      source={resolvedSource}
      cachePolicy="memory-disk"
      contentFit={props.contentFit || 'cover'}
      style={style}
      onError={(e) => {
        setHasError(true);
        if (props.onError) props.onError(e);
      }}
    />
  );
};

const styles = StyleSheet.create({
  fallbackContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  }
});
