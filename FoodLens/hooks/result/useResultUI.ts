import { useState } from 'react';
import { 
  useSharedValue, 
  useAnimatedScrollHandler, 
  useAnimatedStyle, 
  interpolate, 
  Extrapolation 
} from 'react-native-reanimated';

export function useResultUI() {
  const scrollY = useSharedValue(0);
  const [isBreakdownOpen, setIsBreakdownOpen] = useState(false);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const imageAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollY.value, [-100, 0, 100], [1.1, 1, 1.1], Extrapolation.CLAMP);
    const opacity = interpolate(scrollY.value, [0, 300], [1, 0.3], Extrapolation.CLAMP);
    return {
      transform: [{ scale }],
      opacity,
    };
  });

  const headerOverlayStyle = useAnimatedStyle(() => {
     const opacity = interpolate(scrollY.value, [0, 200], [0, 0.8], Extrapolation.CLAMP);
     return { opacity };
  });

  return {
    scrollY,
    scrollHandler,
    imageAnimatedStyle,
    headerOverlayStyle,
    isBreakdownOpen,
    setIsBreakdownOpen
  };
}
