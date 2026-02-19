import React from 'react';
import { View } from 'react-native';
import { TOTAL_STEPS } from '../constants/onboarding.constants';
import { onboardingStyles as styles } from '../styles/onboarding.styles';

type Props = {
  step: number;
  theme: any;
};

export default function OnboardingProgress({ step, theme }: Props) {
  return (
    <View style={styles.progressContainer}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.progressDot,
            {
              backgroundColor: i < step ? theme.primary : theme.border,
              flex: i < step ? 2 : 1,
            },
          ]}
        />
      ))}
    </View>
  );
}
