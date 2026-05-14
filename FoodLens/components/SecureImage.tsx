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

const buildMediaRenderCacheKey = (uri: string): string | null => {
  const assetId = extractMediaRenderAssetId(uri);
  return assetId ? uri : null;
};

const isUriImageSource = (source: unknown): source is ImageSource & { uri: string } =>
  typeof source === 'object' &&
  source !== null &&
  !Array.isArray(source) &&
  'uri' in source &&
  typeof source.uri === 'string';

const toCachedUriSource = (uri: string): ImageSource => {
  const cacheKey = buildMediaRenderCacheKey(uri);
  return cacheKey ? ({ uri, cacheKey } satisfies ImageSource) : ({ uri } satisfies ImageSource);
};

const toCachedObjectSource = (source: ImageSource & { uri: string }): ImageSource => {
  const cacheKey = buildMediaRenderCacheKey(source.uri);
  return cacheKey ? { ...source, cacheKey } : source;
};

const toCachedImageSource = (source: ImageProps['source']): ImageProps['source'] => {
  if (!source) return source;
  if (typeof source === 'string') {
    return toCachedUriSource(source);
  }
  if (typeof source === 'number') {
    return source;
  }
  if (Array.isArray(source)) {
    return source.map((item): ImageSource => {
      if (typeof item === 'string') {
        return toCachedUriSource(item);
      }
      if (isUriImageSource(item)) {
        return toCachedObjectSource(item);
      }
      return item as ImageSource;
    });
  }
  if (isUriImageSource(source)) {
    return toCachedObjectSource(source);
  }
  return source;
};

const toMediaRenderRecyclingKey = (source: ImageProps['source']): string | null => {
  if (typeof source === 'string') {
    return buildMediaRenderCacheKey(source);
  }
  if (Array.isArray(source)) {
    const cacheKeys = source
      .map((item) => {
        if (typeof item === 'string') {
          return buildMediaRenderCacheKey(item);
        }
        if (isUriImageSource(item)) {
          return buildMediaRenderCacheKey(item.uri);
        }
        return null;
      })
      .filter((item): item is string => typeof item === 'string' && item.length > 0);
    return cacheKeys.length > 0 ? cacheKeys.join('|') : null;
  }
  if (isUriImageSource(source)) {
    return buildMediaRenderCacheKey(source.uri);
  }
  return null;
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
  const mediaRenderRecyclingKey = useMemo(() => toMediaRenderRecyclingKey(imageSource), [imageSource]);
  const hasExplicitRecyclingKey = Object.prototype.hasOwnProperty.call(props, 'recyclingKey');

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
      recyclingKey={hasExplicitRecyclingKey ? props.recyclingKey : mediaRenderRecyclingKey ?? undefined}
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
