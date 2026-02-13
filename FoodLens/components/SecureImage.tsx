import React, { useState, useEffect } from 'react';
import { Image, ImageProps, View, StyleSheet, StyleProp, ImageStyle } from 'react-native';
import { ImageOff } from 'lucide-react-native';
import Animated from 'react-native-reanimated';

interface SecureImageProps extends ImageProps {
  fallbackIconSize?: number;
  fallbackColor?: string;
  fallbackContainerStyle?: StyleProp<ImageStyle>;
  sharedTransitionTag?: string; // Add this prop
}

const AnimatedImage = Animated.createAnimatedComponent(Image);

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
  sharedTransitionTag,
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

  // Use AnimatedImage if sharedTransitionTag is provided
  const ImageComponent = sharedTransitionTag ? AnimatedImage : Image;

  return (
    // @ts-ignore - sharedTransitionTag is a Reanimated prop
    <ImageComponent
      {...props}
      source={imageSource}
      style={style}
      sharedTransitionTag={sharedTransitionTag}
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
