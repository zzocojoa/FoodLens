import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { FLOAT_DURATIONS, FLOATING_ITEMS } from '../constants';
import { createFloatingLoop, createOpacityTiming } from '../utils';

export const useFloatingEmojisController = () => {
  const containerOpacity = useRef(new Animated.Value(0)).current;
  const float1 = useRef(new Animated.Value(0)).current;
  const float2 = useRef(new Animated.Value(0)).current;
  const float3 = useRef(new Animated.Value(0)).current;
  const floatValues = useMemo(() => [float1, float2, float3], [float1, float2, float3]);
  const isAnimating = useRef(false);

  const trigger = () => {
    if (isAnimating.current) return;

    isAnimating.current = true;

    Animated.sequence([
      createOpacityTiming(containerOpacity, 1, 600, Easing.out(Easing.ease)),
      createOpacityTiming(containerOpacity, 1, 3000, Easing.linear),
      createOpacityTiming(containerOpacity, 0, 600, Easing.in(Easing.ease)),
      Animated.delay(5000),
    ]).start(({ finished }) => {
      if (finished) {
        isAnimating.current = false;
      }
    });
  };

  useEffect(() => {
    FLOAT_DURATIONS.forEach((duration, idx) => {
      createFloatingLoop(floatValues[idx], duration).start();
    });

    return () => {
      containerOpacity.stopAnimation();
      floatValues.forEach((anim) => anim.stopAnimation());
    };
  }, [containerOpacity, floatValues]);

  const floatingItems = FLOATING_ITEMS.map((item, index) => ({
    ...item,
    translateY: floatValues[index].interpolate({
      inputRange: [0, 1],
      outputRange: item.outputRange,
    }),
  }));

  return {
    containerOpacity,
    floatingItems,
    trigger,
  };
};
