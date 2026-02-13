import { Extrapolation, interpolate, SharedValue, useAnimatedStyle } from 'react-native-reanimated';

export function usePinOverlayOpacity(scrollY: SharedValue<number>) {
  return useAnimatedStyle(() => {
    const opacity = interpolate(scrollY.value, [0, 100], [1, 0], Extrapolation.CLAMP);
    return { opacity };
  });
}
