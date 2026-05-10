import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ArrowRight, Check } from 'lucide-react-native';
import { SAFETY_PRIORITY_OPTIONS } from '../../constants/safetyPassport.constants';
import type { SafetyPriority, Translate } from '../../types/onboarding.types';
import { onboardingStyles as styles } from '../../styles/onboarding.styles';

type Props = {
  theme: any;
  t: Translate;
  priority: SafetyPriority;
  onSelect: (priority: SafetyPriority) => void;
  onNext: () => void;
};

export default function PriorityStep({ theme, t, priority, onSelect, onNext }: Props) {
  return (
    <View style={[styles.stepContainer, { justifyContent: 'space-between', paddingBottom: 24 }]}>
      <View>
        <Text style={[styles.kickerText, { color: theme.primary }]}>
          {t('onboarding.priority.kicker', 'Personalization')}
        </Text>
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {t('onboarding.priority.title', 'What should FoodLens check first?')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t(
            'onboarding.priority.subtitle',
            'This sets the priority for scan results. You can change it later.',
          )}
        </Text>

        <View style={{ marginTop: 22, gap: 12 }}>
          {SAFETY_PRIORITY_OPTIONS.map((option) => {
            const selected = option.id === priority;
            return (
              <TouchableOpacity
                key={option.id}
                style={[
                  styles.priorityCard,
                  {
                    backgroundColor: selected ? `${theme.primary}12` : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => onSelect(option.id)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={t(option.titleKey, option.titleFallback)}
                accessibilityState={{ selected }}
              >
                <View style={[styles.priorityIcon, { backgroundColor: selected ? theme.primary : theme.border }]}>
                  <Text style={[styles.priorityIconText, { color: selected ? '#FFFFFF' : theme.textPrimary }]}>
                    {option.icon}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.priorityTitle, { color: theme.textPrimary }]}>
                    {t(option.titleKey, option.titleFallback)}
                  </Text>
                  <Text style={[styles.priorityDesc, { color: theme.textSecondary }]}>
                    {t(option.descriptionKey, option.descriptionFallback)}
                  </Text>
                </View>
                {selected ? <Check size={22} color={theme.primary} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: theme.primary }]}
        onPress={onNext}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.priority.next', 'Continue to allergies')}
      >
        <Text style={styles.primaryButtonText}>{t('onboarding.priority.next', 'Continue to allergies')}</Text>
        <ArrowRight size={20} color="white" style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    </View>
  );
}
