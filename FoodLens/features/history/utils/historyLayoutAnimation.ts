import { LayoutAnimation } from 'react-native';

export type HistoryLayoutAnimationPreset = Parameters<typeof LayoutAnimation.configureNext>[0];

export const configureHistoryLayoutAnimation = (
  isReduceMotionEnabled: boolean,
  preset: HistoryLayoutAnimationPreset
): void => {
  if (isReduceMotionEnabled) {
    return;
  }

  LayoutAnimation.configureNext(preset);
};
