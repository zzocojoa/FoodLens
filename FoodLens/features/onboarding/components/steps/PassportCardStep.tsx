import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ArrowRight, Edit3, Languages, ShieldCheck } from 'lucide-react-native';
import { ALLERGY_TRANSLATIONS } from '@/services/staticTranslations';
import { translateAllergen } from '@/components/travelerAllergyCard/utils';
import { resolveRestrictionDisplayName } from '@/features/profile/utils/profileSuggestions';
import type { OnboardingDestination, SeverityMap, Translate } from '../../types/onboarding.types';
import { onboardingStyles as styles } from '../../styles/onboarding.styles';

type Props = {
  theme: any;
  t: Translate;
  selectedAllergies: string[];
  severityMap: SeverityMap;
  destination: OnboardingDestination;
  onPrimary: () => void;
  onEdit: () => void;
};

const getAllergenDisplayLabel = (id: string, t: Translate): string => {
  return t(`profile.allergen.${id}`, resolveRestrictionDisplayName(id, t));
};

export default function PassportCardStep({
  theme,
  t,
  selectedAllergies,
  severityMap,
  destination,
  onPrimary,
  onEdit,
}: Props) {
  const translation = ALLERGY_TRANSLATIONS[destination.countryCode] ?? ALLERGY_TRANSLATIONS['DEFAULT'];
  const selectedPreview = selectedAllergies.slice(0, 3);
  const translatedAllergens = selectedPreview.map((allergen) => (
    translateAllergen(allergen, destination.countryCode)
  ));
  const hasAllergies = selectedAllergies.length > 0;

  return (
    <View style={[styles.stepContainer, { justifyContent: 'space-between', paddingBottom: 24 }]}>
      <View>
        <Text style={[styles.kickerText, { color: theme.primary }]}>
          {t('onboarding.passport.kicker', 'Passport preview')}
        </Text>
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {t('onboarding.passport.title', 'Your restaurant sentence is ready.')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t(
            'onboarding.passport.subtitle',
            'Show this card before ordering when you need staff to check ingredients.',
          )}
        </Text>

        <View style={[styles.passportCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <View style={styles.passportHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Languages size={18} color={theme.primary} />
              <Text style={[styles.passportHeaderTitle, { color: theme.textPrimary }]}>
                {t('travelerCard.title', 'Traveler allergy card')}
              </Text>
            </View>
            <View style={[styles.passportLanguageBadge, { backgroundColor: `${theme.primary}14` }]}>
              <Text style={[styles.passportLanguageText, { color: theme.primary }]}>
                {t(destination.languageLabelKey, destination.languageLabelFallback)}
              </Text>
            </View>
          </View>

          <Text style={[styles.passportMessage, { color: theme.textPrimary }]}>
            {translation.text}
          </Text>

          {hasAllergies ? (
            <View style={styles.passportTags}>
              {selectedPreview.map((id, index) => {
                const severity = severityMap[id] || 'moderate';
                return (
                  <View key={id} style={[styles.passportTag, { borderColor: theme.border }]}>
                    <ShieldCheck size={13} color={severity === 'severe' ? '#DC2626' : theme.primary} />
                    <Text style={[styles.passportTagText, { color: theme.textPrimary }]} numberOfLines={1}>
                      {translatedAllergens[index] || getAllergenDisplayLabel(id, t)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Text style={[styles.passportEmptyText, { color: theme.textSecondary }]}>
              {t('onboarding.passport.emptyAllergies', 'No saved allergens yet. You can add them later from the allergy card.')}
            </Text>
          )}
        </View>

        <View style={[styles.restaurantModeCard, { backgroundColor: `${theme.primary}08`, borderColor: `${theme.primary}18` }]}>
          <Text style={[styles.restaurantModeKicker, { color: theme.primary }]}>
            {t('onboarding.passport.restaurantKicker', 'Restaurant mode')}
          </Text>
          <Text style={[styles.restaurantModeText, { color: theme.textSecondary }]}>
            {t(
              'onboarding.passport.restaurantText',
              'The card is saved with your allergy profile and can be opened again from the Allergies tab.',
            )}
          </Text>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          onPress={onPrimary}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.passport.primary', 'Prepare first scan')}
        >
          <Text style={styles.primaryButtonText}>{t('onboarding.passport.primary', 'Prepare first scan')}</Text>
          <ArrowRight size={20} color="white" style={{ marginLeft: 8 }} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryActionButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={onEdit}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.passport.edit', 'Edit card inputs')}
        >
          <Edit3 size={18} color={theme.primary} />
          <Text style={[styles.secondaryActionText, { color: theme.textPrimary }]}>
            {t('onboarding.passport.edit', 'Edit card inputs')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
