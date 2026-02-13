import {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';

const IMAGE_SCALE_RANGE = [-100, 0, 100] as const;
const IMAGE_SCALE_OUTPUT = [1.1, 1, 1.1] as const;
const IMAGE_OPACITY_RANGE = [0, 300] as const;
const IMAGE_OPACITY_OUTPUT = [1, 0.3] as const;
const HEADER_OVERLAY_RANGE = [0, 200] as const;
const HEADER_OVERLAY_OUTPUT = [0, 0.8] as const;

export const useResultScrollAnimations = () => {
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler((event) => {
    scrollY.value = event.contentOffset.y;
  });

  const imageAnimatedStyle = useAnimatedStyle(() => {
    const scale = interpolate(scrollY.value, IMAGE_SCALE_RANGE, IMAGE_SCALE_OUTPUT, Extrapolation.CLAMP);
    const opacity = interpolate(
      scrollY.value,
      IMAGE_OPACITY_RANGE,
      IMAGE_OPACITY_OUTPUT,
      Extrapolation.CLAMP
    );
    return { transform: [{ scale }], opacity };
  });

  const headerOverlayStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      HEADER_OVERLAY_RANGE,
      HEADER_OVERLAY_OUTPUT,
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  return { scrollY, scrollHandler, imageAnimatedStyle, headerOverlayStyle };
};
