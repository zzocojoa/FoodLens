import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { Translate } from '../types/onboarding.types';
import { onboardingStyles as styles } from '../styles/onboarding.styles';

type Props = {
  onPress: () => void;
  theme: any;
  t: Translate;
};

export default function OnboardingBackButton({ onPress, theme, t }: Props) {
  return (
    <TouchableOpacity
      style={styles.backButton}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={t('onboarding.back', 'Back')}
      accessibilityHint={t('onboarding.accessibility.backHint', 'Go to the previous onboarding step')}
    >
      <Ionicons name="chevron-back" size={24} color={theme.textPrimary} />
      <Text style={[styles.backText, { color: theme.textPrimary }]}>{t('onboarding.back', 'Back')}</Text>
    </TouchableOpacity>
  );
}
