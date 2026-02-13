import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import {
  Canvas,
  Circle,
  Group,
  BlurMask,
  vec,
  LinearGradient,
} from '@shopify/react-native-skia';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  interpolate,
} from 'react-native-reanimated';

const ORB_COUNT = 3;
const COLORS = [
  ['#4285F4', '#34A853'], // Google Blue to Green
  ['#FBBC04', '#EA4335'], // Yellow to Red
  ['#FDADEE', '#4285F4'], // Gemini Pink to Blue
];

interface OrbProps {
  index: number;
  canvasSize: { width: number; height: number };
}

const Orb = ({ index, canvasSize }: OrbProps) => {
  const { width, height } = canvasSize;
  const progress = useSharedValue(0);
  const scale = useSharedValue(1);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, {
        duration: 3000 + index * 1000,
        easing: Easing.inOut(Easing.sin),
      }),
      -1,
      true
    );

    scale.value = withRepeat(
      withDelay(
        index * 500,
        withTiming(1.2, {
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
        })
      ),
      -1,
      true
    );
  }, [index, progress, scale]);

  // Skia native values would be better, but for complexity we use shared values
  // In a more advanced version, we'd use useDerivedValue for Skia props
  const cx = width / 2;
  const cy = height / 2;
  const radius = width * 0.3;

  return (
    <Group transform={[{ scale: scale.value }]}>
      <Circle cx={cx} cy={cy} r={radius}>
        <LinearGradient
          start={vec(cx - radius, cy - radius)}
          end={vec(cx + radius, cy + radius)}
          colors={COLORS[index % COLORS.length]}
        />
        <BlurMask blur={30} style="normal" />
      </Circle>
    </Group>
  );
};

export const AnalysisOrbs = () => {
  const { width, height } = useWindowDimensions();

  return (
    <Canvas style={[StyleSheet.absoluteFill, { zIndex: 10 }]}>
      <Group blendMode="screen">
        {Array.from({ length: ORB_COUNT }).map((_, i) => (
          <Orb key={i} index={i} canvasSize={{ width, height }} />
        ))}
      </Group>
    </Canvas>
  );
};

const styles = StyleSheet.create({});
