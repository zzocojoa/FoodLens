import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, { SharedValue } from 'react-native-reanimated';
import { SecureImage } from '../SecureImage';
import { PinOverlay } from './PinOverlay';
import { LinearGradient } from 'expo-linear-gradient';

const { height } = Dimensions.get('window');
const HEADER_HEIGHT = height * 0.6;

interface ResultHeaderProps {
  imageSource: any;
  imageAnimatedStyle: any;
  headerOverlayStyle: any;
  pins: any[];
  scrollY: SharedValue<number>;
  layoutStyle?: any;
}

export function ResultHeader({
  imageSource,
  imageAnimatedStyle,
  headerOverlayStyle,
  pins,
  scrollY,
  layoutStyle
}: ResultHeaderProps) {
  return (
    <View style={styles.headerContainer}>
      <Animated.View style={[styles.imageWrapper, imageAnimatedStyle]}>
         {imageSource && (
            <View style={[styles.image, layoutStyle]}>
              <SecureImage 
                  source={imageSource} 
                  style={StyleSheet.absoluteFill} 
                  resizeMode={layoutStyle ? "cover" : "contain"} 
              />
              <LinearGradient
                colors={['transparent', 'rgba(0,0,0,0.6)', '#000']}
                style={styles.bottomGradient}
              />
            </View>
         )}
         
         <PinOverlay pins={pins} scrollY={scrollY} />
      </Animated.View>
      
      {/* Blur Overlay on Scroll */}
      <Animated.View 
        style={[StyleSheet.absoluteFill, { backgroundColor: 'black' }, headerOverlayStyle]} 
        pointerEvents="none" 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_HEIGHT,
    zIndex: 0,
  },
  imageWrapper: {
    width: '100%',
    height: '100%',
    backgroundColor: '#000',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  bottomGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: '25%', 
  },
});
