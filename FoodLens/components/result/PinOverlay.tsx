import React from 'react';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SpatialPin } from './SpatialPin';
import { PinOverlayProps } from './types';
import { usePinOverlayOpacity } from './hooks/usePinOverlayOpacity';

export function PinOverlay({ pins, scrollY }: PinOverlayProps) {
  const pinOpacityStyle = usePinOverlayOpacity(scrollY);

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
