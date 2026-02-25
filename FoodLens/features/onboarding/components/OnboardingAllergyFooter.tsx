import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { onboardingStyles as styles } from '../styles/onboarding.styles';
import type { Translate } from '../types/onboarding.types';

type Props = {
  theme: any;
  t: Translate;
  onContinue: () => void;
  onSkip: () => void;
};

export default function OnboardingAllergyFooter({ theme, t, onContinue, onSkip }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.footerContainer,
        {
          backgroundColor: theme.background,
          borderTopColor: theme.border,
          paddingBottom: Math.max(10, insets.bottom + 6),
        },
      ]}
    >
      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: theme.primary, flex: 1 }]}
        onPress={onContinue}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.allergies.next', 'Continue')}
        accessibilityHint={t('onboarding.accessibility.allergyContinueHint', 'Go to the final onboarding summary')}
      >
        <Text style={styles.primaryButtonText}>{t('onboarding.allergies.next', 'Continue')}</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={onSkip}
        style={[styles.skipButton, { marginTop: 0, marginLeft: 12 }]}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.skip', 'Skip')}
        accessibilityHint={t('onboarding.accessibility.skipHint', 'Skip this step and continue')}
      >
        <Text style={[styles.skipText, { color: theme.textSecondary }]}>{t('onboarding.skip', 'Skip')}</Text>
      </TouchableOpacity>
    </View>
  );
}
