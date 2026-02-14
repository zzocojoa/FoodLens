import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';
import { SecureImage } from '../SecureImage';
import { PinOverlay } from './PinOverlay';
import { LinearGradient } from 'expo-linear-gradient';
import { resultHeaderStyles as styles } from './styles/resultHeader.styles';
import { ResultHeaderProps } from './types';

const BARCODE_BARS = [2, 1, 3, 1, 2, 4, 1, 2, 3, 1, 4, 1, 2, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1];

export function ResultHeader({
  imageSource,
  imageAnimatedStyle,
  headerOverlayStyle,
  pins,
  scrollY,
  layoutStyle,
  isBarcode
}: ResultHeaderProps) {
  const didTraceRef = useRef(false);
  useEffect(() => {
    if (!__DEV__ || didTraceRef.current) return;
    didTraceRef.current = true;
    console.log('[ResultHeaderTrace] mounted', {
      isBarcode: !!isBarcode,
      hasLayoutStyle: !!layoutStyle,
      layoutStyle,
      resizeMode: isBarcode ? 'contain' : 'cover',
    });
  }, [isBarcode, layoutStyle]);

  return (
    <View style={styles.headerContainer}>
      <Animated.View style={[styles.imageWrapper, imageAnimatedStyle]}>
         {(imageSource || isBarcode) && (
            <View style={[styles.image, layoutStyle]}>
              {isBarcode && (
                <View style={styles.barcodeFallback}>
                  <View style={styles.barcodeRow}>
                    {BARCODE_BARS.map((bar, index) => (
                      <View
                        key={`barcode-bar-${index}`}
                        style={[
                          styles.barcodeBar,
                          {
                            width: bar,
                            opacity: index % 2 === 0 ? 0.95 : 0.7,
                            height: index % 5 === 0 ? 96 : 78,
                          },
                        ]}
                      />
                    ))}
                  </View>
                </View>
              )}
              {imageSource && (
              <SecureImage 
                  source={imageSource} 
                  style={isBarcode ? ((layoutStyle as any) || StyleSheet.absoluteFill) : StyleSheet.absoluteFill} 
                  resizeMode={isBarcode ? "contain" : "cover"} 
                  sharedTransitionTag={isBarcode ? undefined : "foodImage"}
              />
              )}
              {!isBarcode && (
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.6)', '#000']}
                  style={styles.bottomGradient}
                />
              )}
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
