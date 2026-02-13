import React from 'react';
import { View, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SecureImage } from '../SecureImage';
import { PinOverlay } from './PinOverlay';
import { LinearGradient } from 'expo-linear-gradient';
import { resultHeaderStyles as styles } from './styles/resultHeader.styles';
import { ResultHeaderProps } from './types';

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
