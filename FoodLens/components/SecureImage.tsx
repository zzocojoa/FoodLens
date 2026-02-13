import React, { useState, useEffect } from 'react';
import { Image, ImageProps, View, StyleSheet, StyleProp, ImageStyle } from 'react-native';
import { ImageOff } from 'lucide-react-native';

interface SecureImageProps extends ImageProps {
  fallbackIconSize?: number;
  fallbackColor?: string;
  fallbackContainerStyle?: StyleProp<ImageStyle>;
  sharedTransitionTag?: string; // Add this prop
}

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
    <Image
      {...props}
      source={imageSource}
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
