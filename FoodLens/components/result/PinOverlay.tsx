import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, interpolate, Extrapolation } from 'react-native-reanimated';
import { SpatialPin } from './SpatialPin';
import { PinOverlayProps } from './types';

export function PinOverlay({ pins, scrollY }: PinOverlayProps) {
  const pinOpacityStyle = useAnimatedStyle(() => {
     const opacity = interpolate(scrollY.value, [0, 100], [1, 0], Extrapolation.CLAMP);
     return { opacity };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, pinOpacityStyle]}>
      {pins.map((pin, index) => (
          <SpatialPin
            key={`${pin.name || 'pin'}-${index}`}
            x={pin.displayX}
            y={pin.displayY}
            label={pin.name || ''}
            isAllergen={pin.isAllergen}
          />
      ))}
    </Animated.View>
  );
}
