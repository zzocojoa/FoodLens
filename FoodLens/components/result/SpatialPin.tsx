import React from 'react';
import { View, Text } from 'react-native';
import { BlurView } from 'expo-blur';
import { getSpatialPinColor } from './utils/spatialPinTheme';
import { SpatialPinProps } from './types';
import { spatialPinStyles as styles } from './styles/spatialPin.styles';

export const SpatialPin = React.memo(({ x, y, label, isAllergen }: SpatialPinProps) => {
  const pinColor = getSpatialPinColor(isAllergen);

  return (
    <View style={[styles.container, { left: `${x}%`, top: `${y}%` }]}>
      <View style={styles.pinContainer}>
          <View style={[styles.pinPulse, { backgroundColor: pinColor }]} />
          <View style={[styles.pinDot, { backgroundColor: pinColor }]} />
          <View style={styles.pinLabel}>
              <BlurView intensity={30} tint="dark" style={styles.pinLabelBlur}>
                  <Text style={styles.pinLabelText}>{label}</Text>
              </BlurView>
          </View>
      </View>
    </View>
  );
});

SpatialPin.displayName = 'SpatialPin';
