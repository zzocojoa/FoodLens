import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { CircleX } from 'lucide-react-native';
import AllergenGrid from '@/features/profile/components/AllergenGrid';
import RestrictionInput from '@/features/profile/components/RestrictionInput';
import {
  IngredientSuggestion,
  resolveRestrictionDisplayName,
} from '@/features/profile/utils/profileSuggestions';
import type { AllergySeverity } from '@/features/profile/types/profile.types';
import { COMMON_ALLERGENS } from '@/features/profile/constants/profile.constants';
import { SEVERITY_LEVELS } from '@/features/profile/constants/profile.constants';
import { onboardingStyles as styles } from '../../styles/onboarding.styles';
import type { SeverityMap, Translate } from '../../types/onboarding.types';

const COMMON_ALLERGEN_ID_SET = new Set(COMMON_ALLERGENS.map((item) => item.id));

type Props = {
  theme: any;
  t: Translate;
  selectedAllergies: string[];
  severityMap: SeverityMap;
  onToggleAllergen: (id: string) => void;
  onSetSeverity: (id: string, severity: AllergySeverity) => void;
  customInputValue: string;
  customSuggestions: IngredientSuggestion[];
  onCustomInputChange: (text: string) => void;
  onAddCustomAllergen: (item: string) => void;
  onSelectCustomAllergenSuggestion: (item: string) => void;
};

export default function AllergiesStep({
  theme,
  t,
  selectedAllergies,
  severityMap,
  onToggleAllergen,
  onSetSeverity,
  customInputValue,
  customSuggestions,
  onCustomInputChange,
  onAddCustomAllergen,
  onSelectCustomAllergenSuggestion,
}: Props) {
  const [showSearch, setShowSearch] = React.useState(false);
  const customAllergies = React.useMemo(
    () => selectedAllergies.filter((id) => !COMMON_ALLERGEN_ID_SET.has(id)),
    [selectedAllergies]
  );
  const severityControls =
    selectedAllergies.length > 0 ? (
      <View style={{ marginTop: 20, marginBottom: 16 }}>
        <Text style={[styles.sectionTitle, { color: theme.textPrimary }]}>
          {t('onboarding.allergies.severityTitle', 'Set Severity Level')}
        </Text>
        <Text style={[styles.severityHint, { color: theme.textSecondary }]}>
          {t('onboarding.allergies.severityHint', 'Severe warnings appear first. Mild warnings stay quieter but visible.')}
        </Text>
        {selectedAllergies.map((id) => {
          const severity = severityMap[id] || 'moderate';
          return (
            <View
              key={id}
              style={[
                styles.severityRow,
                { backgroundColor: theme.surface, borderColor: theme.border, alignItems: 'flex-start' },
              ]}
            >
              <Text style={[styles.severityAllergenName, { color: theme.textPrimary }]}>
                {t(`profile.allergen.${id}`, resolveRestrictionDisplayName(id, t))}
              </Text>
              <View style={styles.severitySegmentRow}>
                {SEVERITY_LEVELS.map((level) => {
                  const selected = level.key === severity;
                  return (
                    <TouchableOpacity
                      key={level.key}
                      style={[
                        styles.severitySegment,
                        {
                          backgroundColor: selected ? `${level.color}20` : theme.background,
                          borderColor: selected ? level.color : theme.border,
                        },
                      ]}
                      onPress={() => onSetSeverity(id, level.key)}
                      activeOpacity={0.75}
                      accessibilityRole="button"
                      accessibilityLabel={`${t(`profile.allergen.${id}`, resolveRestrictionDisplayName(id, t))} - ${t(`onboarding.severity.${level.key}`, level.label)}`}
                      accessibilityState={{ selected }}
                    >
                      <Text style={{ fontSize: 12 }}>{level.emoji}</Text>
                      <Text
                        style={[
                          styles.severityBadgeText,
                          { color: selected ? level.color : theme.textSecondary },
                        ]}
                        numberOfLines={1}
                      >
                        {t(`onboarding.severity.${level.key}`, level.label)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    ) : null;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.stepScrollContent, { paddingBottom: 120 }]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.heroAreaScroll}>
        <Text style={styles.welcomeEmoji}>🚨</Text>
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {t('onboarding.allergies.title', 'What should FoodLens protect you from?')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t(
            'onboarding.allergies.subtitle',
            'Choose allergies or foods you avoid. Each selected item can warn with a different strength.',
          )}
        </Text>
      </View>

      {severityControls}

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
              onSelectSuggestion={onSelectCustomAllergenSuggestion}
            />
          </View>
        )}
      </View>

      {customAllergies.length > 0 && (
        <View style={{ marginTop: 4, marginBottom: 8 }}>
          <Text style={[styles.sectionTitle, { color: theme.textPrimary, fontSize: 16 }]}>
            {t('onboarding.allergies.additionalTitle', 'Additional allergens')}
          </Text>
          <View style={styles.tagContainer}>
            {customAllergies.map((id) => (
              <TouchableOpacity
                key={`custom-${id}`}
                style={[
                  styles.tag,
                  {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                  },
                ]}
                onPress={() => onToggleAllergen(id)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel={t('onboarding.allergies.removeCustom', 'Remove custom allergen')}
                accessibilityHint={t(
                  'onboarding.allergies.removeCustomHint',
                  'Tap to remove this custom allergen'
                )}
              >
                <Text style={[styles.tagText, { color: theme.textPrimary }]}>
                  {t(`profile.allergen.${id}`, resolveRestrictionDisplayName(id, t))}
                </Text>
                <CircleX size={16} color={theme.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

    </ScrollView>
  );
}
