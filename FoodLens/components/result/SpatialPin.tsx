import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

interface SpatialPinProps {
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  label: string;
  isAllergen?: boolean;
}

export const SpatialPin = React.memo(({ x, y, label, isAllergen }: SpatialPinProps) => {
  return (
    <View style={{ position: 'absolute', left: `${x}%`, top: `${y}%` }}>
      <View style={styles.pinContainer}>
          {/* Pulse Effect */}
          <View style={[styles.pinPulse, { backgroundColor: isAllergen ? '#F43F5E' : '#3B82F6' }]} />
          {/* Core Dot */}
          <View style={[styles.pinDot, { backgroundColor: isAllergen ? '#F43F5E' : '#3B82F6' }]} />
          {/* Label */}
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

const styles = StyleSheet.create({
  pinContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 100,
    height: 100,
    transform: [{ translateX: -50 }, { translateY: -50 }], // Center on coordinate
  },
  pinPulse: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderRadius: 16,
    opacity: 0.3,
  },
  pinDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: 'white',
    shadowColor: 'black',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  pinLabel: {
    position: 'absolute',
    top: 60, // below dot
  },
  pinLabelBlur: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  pinLabelText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
