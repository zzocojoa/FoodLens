import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { ArrowRight, Check, Languages, ShieldAlert, TriangleAlert } from 'lucide-react-native';
import { resolveRestrictionDisplayName } from '@/features/profile/utils/profileSuggestions';
import type { OnboardingDestination, PermissionStatusMap, SeverityMap, Translate } from '../../types/onboarding.types';
import { onboardingStyles as styles } from '../../styles/onboarding.styles';

type Props = {
  theme: any;
  t: Translate;
  selectedAllergies: string[];
  severityMap: SeverityMap;
  destination: OnboardingDestination;
  permissionStatusMap: PermissionStatusMap;
  scanEntryTarget: 'camera' | 'gallery';
  loading: boolean;
  onScan: () => void;
  onCard: () => void;
  onHome: () => void;
};

const getAllergenDisplayLabel = (id: string, t: Translate): string => {
  return t(`profile.allergen.${id}`, resolveRestrictionDisplayName(id, t));
};

const resolveSeverityLabel = (key: string, t: Translate): string => {
  if (key === 'mild') return t('onboarding.severity.mild', 'Mild');
  if (key === 'severe') return t('onboarding.severity.severe', 'Severe');
  return t('onboarding.severity.moderate', 'Moderate');
};

export default function CompleteStep({
  theme,
  t,
  selectedAllergies,
  severityMap,
  destination,
  permissionStatusMap,
  scanEntryTarget,
  loading,
  onScan,
  onCard,
  onHome,
}: Props) {
  const severeAllergies = selectedAllergies.filter((id) => severityMap[id] === 'severe');
  const moderateAllergies = selectedAllergies.filter((id) => severityMap[id] === 'moderate' || !severityMap[id]);
  const firstSevere = severeAllergies[0];
  const firstModerate = moderateAllergies[0];
  const cameraReady = permissionStatusMap.camera === 'granted';
  const scanLabel =
    scanEntryTarget === 'gallery'
      ? t('onboarding.complete.gallery', 'Choose from photos')
      : t('onboarding.complete.scan', 'Scan first meal');

  return (
    <View style={[styles.stepContainer, { justifyContent: 'space-between', paddingBottom: 18 }]}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 6, paddingBottom: 18 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.readyHero}>
          <View style={[styles.readyStamp, { backgroundColor: theme.primary }]}>
            <Check size={36} color="#FFFFFF" />
            <Text style={styles.readyStampText}>{t('onboarding.complete.readyBadge', 'Safety ready')}</Text>
          </View>
        </View>

        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {t('onboarding.complete.title', 'Your safety passport is active.')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t(
            'onboarding.complete.subtitle',
            'Your first scan will use your saved allergens, severity, and traveler card language.',
          )}
        </Text>

        <View style={{ marginTop: 22, gap: 12 }}>
          <View style={[styles.readyRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.readyIcon, { backgroundColor: 'rgba(220,38,38,0.12)' }]}>
              <ShieldAlert size={18} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.readyTitle, { color: theme.textPrimary }]}>
                {t('onboarding.complete.severeWarning', 'Severe warning')}
              </Text>
              <Text style={[styles.readySub, { color: theme.textSecondary }]} numberOfLines={2}>
                {firstSevere
                  ? `${getAllergenDisplayLabel(firstSevere, t)} • ${resolveSeverityLabel('severe', t)}`
                  : t('onboarding.complete.noSevere', 'No severe allergens saved yet')}
              </Text>
            </View>
            <Text style={styles.readyStatusOn}>{t('onboarding.complete.on', 'ON')}</Text>
          </View>

          <View style={[styles.readyRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.readyIcon, { backgroundColor: 'rgba(245,158,11,0.14)' }]}>
              <TriangleAlert size={18} color="#F59E0B" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.readyTitle, { color: theme.textPrimary }]}>
                {t('onboarding.complete.cautionWarning', 'Caution warning')}
              </Text>
              <Text style={[styles.readySub, { color: theme.textSecondary }]} numberOfLines={2}>
                {firstModerate
                  ? `${getAllergenDisplayLabel(firstModerate, t)} • ${resolveSeverityLabel(severityMap[firstModerate] || 'moderate', t)}`
                  : t('onboarding.complete.noModerate', 'Moderate and mild warnings can be added anytime')}
              </Text>
            </View>
            <Text style={styles.readyStatusOn}>{t('onboarding.complete.on', 'ON')}</Text>
          </View>

          <View style={[styles.readyRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.readyIcon, { backgroundColor: `${theme.primary}14` }]}>
              <Languages size={18} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.readyTitle, { color: theme.textPrimary }]}>
                {t('onboarding.complete.travelCard', 'Traveler card')}
              </Text>
              <Text style={[styles.readySub, { color: theme.textSecondary }]} numberOfLines={2}>
                {`${t(destination.titleKey, destination.titleFallback)} • ${t(destination.languageLabelKey, destination.languageLabelFallback)}`}
              </Text>
            </View>
            <Text style={styles.readyStatusReady}>{t('onboarding.complete.ready', 'READY')}</Text>
          </View>
        </View>

        <Text style={[styles.readyPermissionNote, { color: theme.textSecondary }]}>
          {cameraReady
            ? t('onboarding.complete.cameraReady', 'Camera access is ready for the first scan.')
            : t('onboarding.complete.cameraLater', 'Camera permission will stay action-based if you skipped it.')}
        </Text>
      </ScrollView>

      <View style={{ gap: 10 }}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: loading ? 0.6 : 1 }]}
          onPress={onScan}
          activeOpacity={0.8}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={loading ? t('onboarding.complete.saving', 'Saving...') : scanLabel}
          accessibilityState={{ disabled: loading, busy: loading }}
        >
          <Text style={styles.primaryButtonText}>
            {loading ? t('onboarding.complete.saving', 'Saving...') : scanLabel}
          </Text>
          {!loading && <ArrowRight size={20} color="white" style={{ marginLeft: 8 }} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryActionButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={onCard}
          disabled={loading}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.complete.card', 'Show allergy card')}
        >
          <Languages size={18} color={theme.primary} />
          <Text style={[styles.secondaryActionText, { color: theme.textPrimary }]}>
            {t('onboarding.complete.card', 'Show allergy card')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onHome}
          disabled={loading}
          style={styles.skipButton}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.complete.home', 'Go to home')}
        >
          <Text style={[styles.skipText, { color: theme.textSecondary }]}>
            {t('onboarding.complete.home', 'Go to home')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
