import { Animated, Easing } from 'react-native';

export const createOpacityTiming = (
  opacity: Animated.Value,
  toValue: number,
  duration: number,
  easing: (value: number) => number
) =>
  Animated.timing(opacity, {
    toValue,
    duration,
    easing,
    useNativeDriver: true,
    isInteraction: false,
  });

export const createFloatingLoop = (value: Animated.Value, duration: number) =>
  Animated.loop(
    Animated.sequence([
      Animated.timing(value, {
        toValue: 1,
        duration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
        isInteraction: false,
      }),
      Animated.timing(value, {
        toValue: 0,
        duration,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
        isInteraction: false,
      }),
    ])
  );
