import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { CameraMode } from '../types/scanCamera.types';

export const useScanCameraLaserAnimation = (mode: CameraMode) => {
  const laserAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mode === 'BARCODE') {
      laserAnim.setValue(0);
      Animated.loop(
        Animated.sequence([
          Animated.timing(laserAnim, {
            toValue: 1,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(laserAnim, {
            toValue: 0,
            duration: 1500,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();
      return;
    }

    laserAnim.stopAnimation();
    laserAnim.setValue(0);
  }, [laserAnim, mode]);

  return laserAnim;
};
