import {
  runOnJS,
  SensorType,
  useAnimatedReaction,
  useAnimatedSensor,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import {
  APPLE_SPRING_CONFIG,
  GLOW_COLORS,
  GLOW_SPRING_CONFIG,
  MOTION_THRESHOLD,
  OFFSET_DECAY,
  OFFSET_LIMIT,
  SENSOR_SENSITIVITY,
} from '../constants';
import { clamp } from '../utils';

export const useSpatialAppleMotion = (emoji: string, onMotionDetect?: () => void) => {
  const sensor = useAnimatedSensor(SensorType.GYROSCOPE, { interval: 20 });
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);

  const glowColor = GLOW_COLORS[emoji] || '#F43F5E';

  useDerivedValue(() => {
    const velocityX = sensor.sensor.value.y * SENSOR_SENSITIVITY;
    const velocityY = sensor.sensor.value.x * SENSOR_SENSITIVITY;

    offsetX.value = clamp((offsetX.value + velocityX) * OFFSET_DECAY, -OFFSET_LIMIT, OFFSET_LIMIT);
    offsetY.value = clamp((offsetY.value + velocityY) * OFFSET_DECAY, -OFFSET_LIMIT, OFFSET_LIMIT);

    return offsetX.value;
  });

  useAnimatedReaction(
    () => Math.abs(offsetX.value) + Math.abs(offsetY.value),
    (magnitude) => {
      if (magnitude > MOTION_THRESHOLD && onMotionDetect) {
        runOnJS(onMotionDetect)();
      }
    },
    [onMotionDetect]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: withSpring(offsetX.value, APPLE_SPRING_CONFIG) },
      { translateY: withSpring(offsetY.value, APPLE_SPRING_CONFIG) },
    ],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: withSpring(-offsetX.value * SENSOR_SENSITIVITY, GLOW_SPRING_CONFIG) },
      { translateY: withSpring(-offsetY.value * SENSOR_SENSITIVITY, GLOW_SPRING_CONFIG) },
      { scale: 1.2 },
    ],
    opacity: 0.6,
    backgroundColor: glowColor,
  }));

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value * 1.2 },
      { translateY: offsetY.value * 1.2 },
    ],
  }));

  return {
    animatedStyle,
    glowStyle,
    highlightStyle,
  };
};
