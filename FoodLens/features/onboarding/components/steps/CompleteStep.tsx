import React from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SEVERITY_LEVELS } from '@/features/profile/constants/profile.constants';
import type { Gender } from '@/features/profile/types/profile.types';
import type { PermissionStatusMap, SeverityMap, Translate } from '../../types/onboarding.types';
import { onboardingStyles as styles } from '../../styles/onboarding.styles';

type Props = {
  theme: any;
  t: Translate;
  selectedAllergies: string[];
  severityMap: SeverityMap;
  gender: Gender | null;
  birthDate: Date;
  permissionStatusMap: PermissionStatusMap;
  loading: boolean;
  onComplete: () => void;
};

export default function CompleteStep({
  theme,
  t,
  selectedAllergies,
  severityMap,
  gender,
  birthDate,
  permissionStatusMap,
  loading,
  onComplete,
}: Props) {
  const now = new Date();
  const birthMonth = birthDate.getMonth();
  const birthDay = birthDate.getDate();
  const hasHadBirthdayThisYear =
    now.getMonth() > birthMonth || (now.getMonth() === birthMonth && now.getDate() >= birthDay);
  const age = now.getFullYear() - birthDate.getFullYear() - (hasHadBirthdayThisYear ? 0 : 1);
  const genderLabel = gender
    ? t(`onboarding.profile.gender.${gender}`, gender.charAt(0).toUpperCase() + gender.slice(1))
    : null;

  // Group allergies by severity
  const severeAllergies = selectedAllergies.filter((id) => severityMap[id] === 'severe');
  const mildAllergies = selectedAllergies.filter((id) => severityMap[id] === 'mild');
  const moderateAllergies = selectedAllergies.filter((id) => severityMap[id] === 'moderate' || !severityMap[id]);

  const permissionRows = [
    {
      key: 'camera',
      label: t('onboarding.permissions.camera', 'Camera Access'),
      status: permissionStatusMap.camera,
    },
    {
      key: 'library',
      label: t('onboarding.permissions.gallery', 'Photo Library'),
      status: permissionStatusMap.library,
    },
    {
      key: 'location',
      label: t('onboarding.permissions.location', 'Location Access'),
      status: permissionStatusMap.location,
    },
  ] as const;

  const statusTextByKey = {
    granted: t('onboarding.permissions.status.granted', 'Granted'),
    denied: t('onboarding.permissions.status.denied', 'Denied'),
    not_requested: t('onboarding.permissions.status.notRequested', 'Not requested'),
    unavailable: t('onboarding.permissions.status.unavailable', 'Unavailable'),
  } as const;

  const statusColorByKey = {
    granted: '#10B981',
    denied: '#EF4444',
    not_requested: theme.textSecondary,
    unavailable: '#F59E0B',
  } as const;

  return (
    <View style={styles.stepContainer}>
      {/* Hero Section */}
      <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 8 }}>
        <View style={{ position: 'relative', width: 140, height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
          {/* Glow backdrop */}
          <View style={{
            position: 'absolute', width: 120, height: 120, borderRadius: 60,
            backgroundColor: theme.primary, opacity: 0.15,
          }} />
          {/* Checkmark icon */}
          <View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: theme.primary, alignItems: 'center', justifyContent: 'center',
            shadowColor: theme.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20,
          }}>
            <Ionicons name="checkmark" size={56} color="white" />
          </View>
        </View>
        <Text style={[styles.welcomeTitle, { color: theme.textPrimary }]}>
          {t('onboarding.complete.title', "You're all set!")}
        </Text>
        <Text style={[styles.welcomeSubtitle, { color: theme.textSecondary, marginTop: 8, paddingHorizontal: 24 }]}>
          {t('onboarding.complete.subtitle', "Your personalized allergen shield is ready. We've calibrated FoodLens to your specific needs.")}
        </Text>
      </View>

      {/* Bento Grid Summary */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Row: Profile + Mild Risk */}
        <View style={{ flexDirection: 'row', gap: 12, minHeight: 130 }}>
          {/* Profile Card */}
          <View style={{
            flex: 1, borderRadius: 16, padding: 16,
            backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
            justifyContent: 'space-between',
          }}>
            <Ionicons name="person-circle" size={32} color={theme.primary} style={{ marginBottom: 8 }} />
            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              {t('onboarding.complete.profile', 'Profile')}
            </Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: theme.textPrimary }}>
              {genderLabel ? `${genderLabel}, ${age}` : `${age}`}
            </Text>
          </View>

          {/* Mild / Moderate Risk Card */}
          <View style={{
            flex: 1, borderRadius: 16, padding: 16,
            backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
            justifyContent: 'space-between',
          }}>
            <View style={{
              width: 32, height: 32, borderRadius: 16,
              backgroundColor: 'rgba(245,158,11,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 8,
            }}>
              <Ionicons name="warning" size={18} color="#F59E0B" />
            </View>
            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
              {t('onboarding.complete.mildRisk', 'Mild Risk')}
            </Text>
            {[...mildAllergies, ...moderateAllergies].length > 0 ? (
              <Text style={{ fontSize: 16, fontWeight: '700', color: theme.textPrimary }} numberOfLines={2}>
                {[...mildAllergies, ...moderateAllergies]
                  .map((id) => t(`profile.allergen.${id}`, id.charAt(0).toUpperCase() + id.slice(1)))
                  .join(', ')}
              </Text>
            ) : (
              <Text style={{ fontSize: 14, fontWeight: '500', color: theme.textSecondary }}>
                {t('onboarding.complete.none', 'None')}
              </Text>
            )}
          </View>
        </View>

        {/* Full Width: Severe Allergens */}
        <View style={{
          borderRadius: 16, padding: 20,
          backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
          overflow: 'hidden',
        }}>
          <View
            style={{
              position: 'absolute',
              right: -40,
              top: -40,
              width: 120,
              height: 120,
              borderRadius: 60,
              backgroundColor: 'rgba(239,68,68,0.06)',
            }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <View style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: 'rgba(239,68,68,0.1)', alignItems: 'center', justifyContent: 'center',
            }}>
              <Ionicons name="shield" size={18} color="#EF4444" />
            </View>
            <Text style={{ fontSize: 12, fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: 1 }}>
              {t('onboarding.complete.severeAllergens', 'Severe Allergens')}
            </Text>
          </View>
          {severeAllergies.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {severeAllergies.map((id) => (
                <View key={id} style={{
                  paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
                  backgroundColor: 'rgba(239,68,68,0.08)', borderWidth: 1, borderColor: 'rgba(239,68,68,0.15)',
                  flexDirection: 'row', alignItems: 'center', gap: 6,
                }}>
                  <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#EF4444' }} />
                  <Text style={{ fontWeight: '700', color: theme.textPrimary }}>
                    {t(`profile.allergen.${id}`, id.charAt(0).toUpperCase() + id.slice(1))}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={{ fontSize: 14, fontWeight: '500', color: theme.textSecondary }}>
              {t('onboarding.complete.noSevere', 'No severe allergens detected — great news!')}
            </Text>
          )}
        </View>

        {/* AI Ready Insight */}
        <View style={{
          borderRadius: 12, padding: 14,
          backgroundColor: `${theme.primary}08`, borderWidth: 1, borderColor: `${theme.primary}15`,
          flexDirection: 'row', alignItems: 'flex-start', gap: 10,
        }}>
          <Ionicons name="sparkles" size={20} color={theme.primary} style={{ marginTop: 1 }} />
          <Text style={{ flex: 1, fontSize: 13, color: theme.textSecondary, lineHeight: 19 }}>
            <Text style={{ fontWeight: '700', color: theme.primary }}>
              {t('onboarding.complete.aiReady', 'AI Ready:')}
            </Text>
            {' '}{t('onboarding.complete.aiReadyDesc', 'FoodLens will now auto-scan labels for your specific triggers.')}
          </Text>
        </View>

        {/* Permission Summary */}
        <View style={{
          borderRadius: 12, padding: 14,
          backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border,
          gap: 10,
        }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: theme.textPrimary, textTransform: 'uppercase', letterSpacing: 0.8 }}>
            {t('onboarding.complete.permissionsSummaryTitle', 'Permissions Summary')}
          </Text>
          {permissionRows.map((row) => (
            <View key={row.key} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 14, color: theme.textSecondary }}>{row.label}</Text>
              <Text style={{ fontSize: 14, fontWeight: '700', color: statusColorByKey[row.status] }}>
                {statusTextByKey[row.status]}
              </Text>
            </View>
          ))}
          <Text style={{ fontSize: 12, color: theme.textSecondary, lineHeight: 17 }}>
            {t(
              'onboarding.complete.permissionsSummaryHint',
              'You can change these later in iPhone Settings > FoodLens.'
            )}
          </Text>
        </View>
      </ScrollView>

      {/* CTA Button */}
      <View style={{ paddingHorizontal: 24, paddingBottom: 18, paddingTop: 10 }}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.primary, opacity: loading ? 0.6 : 1 }]}
          onPress={onComplete}
          activeOpacity={0.8}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel={
            loading
              ? t('onboarding.complete.saving', 'Saving...')
              : t('onboarding.complete.start', 'Start Using FoodLens')
          }
          accessibilityHint={t('onboarding.accessibility.completeHint', 'Finish onboarding and open the app')}
          accessibilityState={{ disabled: loading, busy: loading }}
        >
          <Text style={styles.primaryButtonText}>
            {loading
              ? t('onboarding.complete.saving', 'Saving...')
              : t('onboarding.complete.start', 'Start Using FoodLens')}
          </Text>
          {!loading && <Ionicons name="arrow-forward" size={20} color="white" style={{ marginLeft: 8 }} />}
        </TouchableOpacity>
      </View>
    </View>
  );
}
