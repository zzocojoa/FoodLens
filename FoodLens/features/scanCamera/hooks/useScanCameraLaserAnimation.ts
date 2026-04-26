import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';
import { CameraMode } from '../types/scanCamera.types';

export const useScanCameraLaserAnimation = (mode: CameraMode) => {
  const laserAnim = useRef(new Animated.Value(0)).current;
  const [isReduceMotionEnabled, setIsReduceMotionEnabled] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    void AccessibilityInfo.isReduceMotionEnabled().then((isEnabled: boolean) => {
      if (!isMounted) {
        return;
      }

      setIsReduceMotionEnabled(isEnabled);
    });

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (isEnabled: boolean) => {
        setIsReduceMotionEnabled(isEnabled);
      }
    );

    return () => {
      isMounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (mode === 'BARCODE') {
      laserAnim.setValue(0);
      if (isReduceMotionEnabled) {
        return undefined;
      }

      const animation = Animated.loop(
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
      );
      animation.start();
      return () => {
        animation.stop();
      };
    }

    laserAnim.stopAnimation();
    laserAnim.setValue(0);
    return undefined;
  }, [isReduceMotionEnabled, laserAnim, mode]);

  return laserAnim;
};
