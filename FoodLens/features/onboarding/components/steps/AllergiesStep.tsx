import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import AllergenGrid from '@/features/profile/components/AllergenGrid';
import RestrictionInput from '@/features/profile/components/RestrictionInput';
import { SEVERITY_LEVELS } from '@/features/profile/constants/profile.constants';
import { onboardingStyles as styles } from '../../styles/onboarding.styles';
import type { SeverityMap, Translate } from '../../types/onboarding.types';

type Props = {
  theme: any;
  t: Translate;
  selectedAllergies: string[];
  severityMap: SeverityMap;
  onToggleAllergen: (id: string) => void;
  onCycleSeverity: (id: string) => void;
  customInputValue: string;
  customSuggestions: string[];
  onCustomInputChange: (text: string) => void;
  onAddCustomAllergen: (item: string) => void;
};

export default function AllergiesStep({
  theme,
  t,
  selectedAllergies,
  severityMap,
  onToggleAllergen,
  onCycleSeverity,
  customInputValue,
  customSuggestions,
  onCustomInputChange,
  onAddCustomAllergen,
}: Props) {
  const [showSearch, setShowSearch] = React.useState(false);
  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.stepScrollContent, { paddingBottom: 120 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroAreaScroll}>
        <Text style={styles.welcomeEmoji}>🚨</Text>
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {t('onboarding.allergies.title', 'Your Allergies')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t(
            'onboarding.allergies.subtitle',
            'Select allergens to avoid. Tap the severity badge to adjust the warning level.',
          )}
        </Text>
      </View>

      <AllergenGrid
        theme={theme}
        selectedAllergies={selectedAllergies}
        onToggle={onToggleAllergen}
        t={t}
      />

      <View style={{ marginTop: 24, paddingBottom: 8 }}>
        {!showSearch ? (
          <TouchableOpacity
            style={[styles.skipButton, { marginTop: 0, alignSelf: 'center' }]}
            onPress={() => setShowSearch(true)}
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.allergies.notFound', 'Not finding yours?')}
            accessibilityHint={t('onboarding.accessibility.searchAllergenHint', 'Open search to add a custom allergen')}
          >
            <Text style={[styles.skipText, { color: theme.primary, fontWeight: '600' }]}>
              {t('onboarding.allergies.notFound', 'Not finding yours?')}
            </Text>
          </TouchableOpacity>
        ) : (
          <View>
            <Text style={[styles.sectionTitle, { color: theme.textPrimary, fontSize: 16, marginBottom: 12 }]}>
              {t('onboarding.allergies.searchTitle', 'Search additional allergens')}
            </Text>
            <RestrictionInput
              theme={theme}
              inputValue={customInputValue}
              suggestions={customSuggestions}
              t={t}
              onChangeText={onCustomInputChange}
              onSubmit={() => onAddCustomAllergen(customInputValue)}
              onSelectSuggestion={onAddCustomAllergen}
            />
          </View>
        )}
      </View>

      {selectedAllergies.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
            {t('onboarding.allergies.severityTitle', 'Set Severity Level')}
          </Text>
          <Text style={[styles.severityHint, { color: theme.textSecondary }]}>
            {t('onboarding.allergies.severityHint', 'Tap to cycle: Mild → Moderate → Severe')}
          </Text>
          {selectedAllergies.map((id) => {
            const severity = severityMap[id] || 'moderate';
            const level = SEVERITY_LEVELS.find((entry) => entry.key === severity)!;
            return (
              <TouchableOpacity
                key={id}
                style={[
                  styles.severityRow,
                  { backgroundColor: theme.surface, borderColor: `${level.color}40` },
                ]}
                onPress={() => onCycleSeverity(id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={`${t(`profile.allergen.${id}`, `${id.charAt(0).toUpperCase()}${id.slice(1)}`)} - ${t(`onboarding.severity.${level.key}`, level.label)}`}
                accessibilityHint={t('onboarding.accessibility.severityCycleHint', 'Tap to cycle severity level')}
              >
                <Text style={[styles.severityAllergenName, { color: theme.textPrimary }]}>
                  {t(`profile.allergen.${id}`, `${id.charAt(0).toUpperCase()}${id.slice(1)}`)}
                </Text>
                <View
                  style={[
                    styles.severityBadge,
                    { backgroundColor: `${level.color}20`, borderColor: level.color },
                  ]}
                >
                  <Text style={{ fontSize: 14 }}>{level.emoji}</Text>
                  <Text style={[styles.severityBadgeText, { color: level.color }]}>
                    {t(`onboarding.severity.${level.key}`, level.label)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}
