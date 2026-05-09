import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { ArrowRight, ShieldCheck, TriangleAlert } from 'lucide-react-native';
import type { Translate } from '../../types/onboarding.types';
import { onboardingStyles as styles } from '../../styles/onboarding.styles';

type Props = {
  theme: any;
  t: Translate;
  onStart: () => void;
};

export default function WelcomeStep({ theme, t, onStart }: Props) {
  return (
    <View style={[styles.stepContainer, { justifyContent: 'space-between', paddingBottom: 24 }]}>
      <View style={{ paddingTop: 12 }}>
        <View style={styles.safetyBrandRow}>
          <View style={[styles.safetyBrandMark, { backgroundColor: theme.primary }]}>
            <Text style={styles.safetyBrandMarkText}>{t('onboarding.welcome.brandMark', 'FL')}</Text>
          </View>
          <Text style={[styles.safetyBrandName, { color: theme.textPrimary }]}>
            {t('onboarding.welcome.brandName', 'FoodLens')}
          </Text>
        </View>

        <View style={[styles.resultPreviewCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Image
            source={require('@/assets/images/onboarding_hero.png')}
            style={styles.resultPreviewImage}
            resizeMode="cover"
          />
          <View style={styles.resultPreviewOverlay}>
            <View style={styles.resultPreviewBadge}>
              <ShieldCheck size={14} color="#FFFFFF" />
              <Text style={styles.resultPreviewBadgeText}>
                {t('onboarding.welcome.previewBadge', 'Safety preview')}
              </Text>
            </View>
            <View style={[styles.analysisPreviewPanel, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={styles.analysisPreviewHeader}>
                <Text style={[styles.analysisPreviewFood, { color: theme.textPrimary }]}>
                  {t('onboarding.welcome.previewFood', 'Food photo')}
                </Text>
                <View style={styles.analysisPreviewRisk}>
                  <TriangleAlert size={14} color="#DC2626" />
                  <Text style={styles.analysisPreviewRiskText}>
                    {t('onboarding.welcome.previewRisk', 'Check first')}
                  </Text>
                </View>
              </View>
              <View style={styles.analysisPreviewGrid}>
                <View style={[styles.analysisPreviewCell, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={[styles.analysisPreviewCellTitle, { color: theme.textPrimary }]}>
                    {t('onboarding.welcome.previewAllergen', 'Allergens')}
                  </Text>
                  <Text style={[styles.analysisPreviewCellSub, { color: theme.textSecondary }]}>
                    {t('onboarding.welcome.previewAllergenSub', 'Matched to you')}
                  </Text>
                </View>
                <View style={[styles.analysisPreviewCell, { backgroundColor: theme.background, borderColor: theme.border }]}>
                  <Text style={[styles.analysisPreviewCellTitle, { color: theme.textPrimary }]}>
                    {t('onboarding.welcome.previewCard', 'Travel card')}
                  </Text>
                  <Text style={[styles.analysisPreviewCellSub, { color: theme.textSecondary }]}>
                    {t('onboarding.welcome.previewCardSub', 'Local language')}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>

        <Text style={[styles.kickerText, { color: theme.primary }]}>
          {t('onboarding.welcome.kicker', 'Safety Passport')}
        </Text>
        <Text style={[styles.welcomeTitle, { color: theme.textPrimary }]}>
          {t('onboarding.welcome.title', 'Know if it is safe before you eat.')}
        </Text>
        <Text style={[styles.welcomeSubtitle, { color: theme.textSecondary }]}>
          {t(
            'onboarding.welcome.subtitle',
            'FoodLens turns food photos into allergy, diet, and travel safety guidance.',
          )}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: theme.primary }]}
        onPress={onStart}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.welcome.start', 'Create safety passport')}
        accessibilityHint={t('onboarding.accessibility.welcomeStartHint', 'Move to the priority onboarding step')}
      >
        <Text style={styles.primaryButtonText}>{t('onboarding.welcome.start', 'Create safety passport')}</Text>
        <ArrowRight size={20} color="white" style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    </View>
  );
}
