import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const MapView = (props) => {
  return (
    <View style={[styles.container, props.style]}>
      <Text style={styles.text}>Map (Web Mock for UI Agent)</Text>
    </View>
  );
};

export const Marker = () => <View />;
export const Polyline = () => <View />;
export const Polygon = () => <View />;
export const Callout = () => <View />;
export const PROVIDER_DEFAULT = 'default';
export const PROVIDER_GOOGLE = 'google';

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  text: {
    color: '#6B7280',
    fontWeight: 'bold',
  },
});

export default MapView;
