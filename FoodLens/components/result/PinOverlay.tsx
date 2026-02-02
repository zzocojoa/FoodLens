import React from 'react';
import { StyleSheet } from 'react-native';
import Animated, { useAnimatedStyle, interpolate, Extrapolation, SharedValue } from 'react-native-reanimated';
import { SpatialPin } from './SpatialPin';

interface PinOverlayProps {
  pins: any[];
  scrollY: SharedValue<number>;
}

export function PinOverlay({ pins, scrollY }: PinOverlayProps) {
  const pinOpacityStyle = useAnimatedStyle(() => {
     const opacity = interpolate(scrollY.value, [0, 100], [1, 0], Extrapolation.CLAMP);
     return { opacity };
  });

  return (
    <Animated.View style={[StyleSheet.absoluteFill, pinOpacityStyle]}>
      {pins.map((pin, index) => (
          <SpatialPin
            key={index}
            x={pin.displayX}
            y={pin.displayY}
            label={pin.name}
            isAllergen={pin.isAllergen}
          />
      ))}
    </Animated.View>
  );
}
