import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, {
  Circle,
  Rect,
} from 'react-native-svg';

type GrainDot = {
  cx: number;
  cy: number;
  opacity: number;
  r: number;
};

type GrainFiber = {
  height: number;
  opacity: number;
  rotation: number;
  width: number;
  x: number;
  y: number;
};

type PearlGrainOverlayProps = {
  highlightColor: string;
  highlightOpacity: number;
  shadowColor: string;
  shadowOpacity: number;
};

const getNextSeed = (seed: number): number => {
  return (seed * 9301 + 49297) % 233280;
};

const getUnitValue = (seed: number): number => {
  return seed / 233280;
};

const createGrainDots = (
  count: number,
  initialSeed: number,
  minRadius: number,
  maxRadius: number,
  minOpacity: number,
  maxOpacity: number,
): GrainDot[] => {
  let seed = initialSeed;

  return Array.from({ length: count }, () => {
    seed = getNextSeed(seed);
    const cx = getUnitValue(seed) * 100;

    seed = getNextSeed(seed);
    const cy = getUnitValue(seed) * 100;

    seed = getNextSeed(seed);
    const radius = minRadius + (getUnitValue(seed) * (maxRadius - minRadius));

    seed = getNextSeed(seed);
    const opacity = minOpacity + (getUnitValue(seed) * (maxOpacity - minOpacity));

    return {
      cx,
      cy,
      opacity,
      r: radius,
    };
  });
};

const createGrainFibers = (
  count: number,
  initialSeed: number,
  minLength: number,
  maxLength: number,
  thickness: number,
  minOpacity: number,
  maxOpacity: number,
): GrainFiber[] => {
  let seed = initialSeed;

  return Array.from({ length: count }, () => {
    seed = getNextSeed(seed);
    const x = getUnitValue(seed) * 100;

    seed = getNextSeed(seed);
    const y = getUnitValue(seed) * 100;

    seed = getNextSeed(seed);
    const width = minLength + (getUnitValue(seed) * (maxLength - minLength));

    seed = getNextSeed(seed);
    const opacity = minOpacity + (getUnitValue(seed) * (maxOpacity - minOpacity));

    seed = getNextSeed(seed);
    const rotation = (getUnitValue(seed) * 60) - 30;

    return {
      height: thickness,
      opacity,
      rotation,
      width,
      x,
      y,
    };
  });
};

const shadowDots = createGrainDots(52, 1931, 0.10, 0.34, 0.18, 0.72);
const highlightDots = createGrainDots(40, 7129, 0.08, 0.24, 0.16, 0.58);
const shadowFibers = createGrainFibers(18, 3011, 0.8, 2.4, 0.12, 0.18, 0.54);
const highlightFibers = createGrainFibers(14, 9103, 0.6, 1.8, 0.10, 0.12, 0.44);

const getFiberTransform = (fiber: GrainFiber): string => {
  const centerX = fiber.x + (fiber.width / 2);
  const centerY = fiber.y + (fiber.height / 2);

  return `rotate(${fiber.rotation} ${centerX} ${centerY})`;
};

export function PearlGrainOverlay({
  highlightColor,
  highlightOpacity,
  shadowColor,
  shadowOpacity,
}: PearlGrainOverlayProps): React.JSX.Element {
  return (
    <View pointerEvents="none" style={styles.container}>
      <Svg
        height="100%"
        preserveAspectRatio="none"
        style={StyleSheet.absoluteFill}
        viewBox="0 0 100 100"
        width="100%"
      >
        {shadowDots.map((dot, index) => (
          <Circle
            key={`shadow-dot-${index}`}
            cx={dot.cx}
            cy={dot.cy}
            fill={shadowColor}
            fillOpacity={dot.opacity * shadowOpacity}
            r={dot.r}
          />
        ))}
        {shadowFibers.map((fiber, index) => (
          <Rect
            key={`shadow-fiber-${index}`}
            fill={shadowColor}
            fillOpacity={fiber.opacity * shadowOpacity}
            height={fiber.height}
            rx={fiber.height / 2}
            transform={getFiberTransform(fiber)}
            width={fiber.width}
            x={fiber.x}
            y={fiber.y}
          />
        ))}
        {highlightDots.map((dot, index) => (
          <Circle
            key={`highlight-dot-${index}`}
            cx={dot.cx}
            cy={dot.cy}
            fill={highlightColor}
            fillOpacity={dot.opacity * highlightOpacity}
            r={dot.r}
          />
        ))}
        {highlightFibers.map((fiber, index) => (
          <Rect
            key={`highlight-fiber-${index}`}
            fill={highlightColor}
            fillOpacity={fiber.opacity * highlightOpacity}
            height={fiber.height}
            rx={fiber.height / 2}
            transform={getFiberTransform(fiber)}
            width={fiber.width}
            x={fiber.x}
            y={fiber.y}
          />
        ))}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
  },
});

export default PearlGrainOverlay;
