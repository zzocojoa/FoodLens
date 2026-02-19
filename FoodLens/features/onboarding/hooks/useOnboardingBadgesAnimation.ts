import { useEffect } from 'react';
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export const useOnboardingBadgesAnimation = () => {
  const bounceRight = useSharedValue(0);
  const bounceLeft = useSharedValue(0);

  useEffect(() => {
    bounceRight.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 1500, easing: Easing.bezier(0.8, 0, 1, 1) }),
        withTiming(0, { duration: 1500, easing: Easing.bezier(0, 0, 0.2, 1) }),
      ),
      -1,
      true,
    );
    bounceLeft.value = withRepeat(
      withSequence(
        withTiming(-10, { duration: 2000, easing: Easing.bezier(0.8, 0, 1, 1) }),
        withTiming(0, { duration: 2000, easing: Easing.bezier(0, 0, 0.2, 1) }),
      ),
      -1,
      true,
    );
  }, [bounceLeft, bounceRight]);

  const badgeRightStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceRight.value }],
  }));
  const badgeLeftStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bounceLeft.value }],
  }));

  return { badgeRightStyle, badgeLeftStyle };
};
