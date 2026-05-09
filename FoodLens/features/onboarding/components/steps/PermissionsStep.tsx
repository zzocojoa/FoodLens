import React from 'react';
import { Image, Text, TouchableOpacity, View } from 'react-native';
import { Camera, Images, ShieldCheck } from 'lucide-react-native';
import type { PermissionStatusMap, Translate } from '../../types/onboarding.types';
import { onboardingStyles as styles } from '../../styles/onboarding.styles';

type Props = {
  theme: any;
  t: Translate;
  permissionStatusMap: PermissionStatusMap;
  onRequestCamera: () => void;
  onRequestLibrary: () => void;
  onSkip: () => void;
};

const resolveStatusLabel = (status: PermissionStatusMap['camera'], t: Translate): string => {
  if (status === 'granted') return t('onboarding.permissions.status.granted', 'Granted');
  if (status === 'denied') return t('onboarding.permissions.status.denied', 'Denied');
  if (status === 'unavailable') return t('onboarding.permissions.status.unavailable', 'Unavailable');
  return t('onboarding.permissions.status.notRequested', 'Not requested');
};

export default function PermissionsStep({
  theme,
  t,
  permissionStatusMap,
  onRequestCamera,
  onRequestLibrary,
  onSkip,
}: Props) {
  return (
    <View style={[styles.stepContainer, { justifyContent: 'space-between', paddingBottom: 24 }]}>
      <View>
        <Text style={[styles.kickerText, { color: theme.primary }]}>
          {t('onboarding.permissions.kicker', 'First scan')}
        </Text>
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {t('onboarding.permissions.title', 'Ready to check your first meal?')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t(
            'onboarding.permissions.subtitle',
            'Camera or photo access is requested only after you choose how to scan.',
          )}
        </Text>

        <View style={[styles.permissionPreviewCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Image
            source={require('@/assets/images/guide-good.jpg')}
            style={styles.permissionPreviewImage}
            resizeMode="cover"
          />
          <View style={[styles.scanCoachmark, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={[styles.scanCoachmarkTitle, { color: theme.textPrimary }]}>
              {t('onboarding.permissions.coachmarkTitle', 'Start with the plate you worry about most.')}
            </Text>
            <Text style={[styles.scanCoachmarkText, { color: theme.textSecondary }]}>
              {t(
                'onboarding.permissions.coachmarkText',
                'For your first scan, keep one dish centered so the allergy check is easier to read.',
              )}
            </Text>
          </View>
        </View>

        <View style={[styles.privacyCard, { backgroundColor: `${theme.primary}08`, borderColor: `${theme.primary}18` }]}>
          <ShieldCheck size={18} color={theme.primary} />
          <Text style={[styles.privacyCardText, { color: theme.textSecondary }]}>
            {t(
              'onboarding.permissions.privacy',
              'FoodLens analyzes only the image and result you choose. Location is requested separately when needed.',
            )}
          </Text>
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          onPress={onRequestCamera}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.permissions.openCamera', 'Open camera')}
        >
          <Camera size={20} color="#FFFFFF" />
          <Text style={[styles.primaryButtonText, { marginLeft: 8 }]}>
            {t('onboarding.permissions.openCamera', 'Open camera')}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.secondaryActionButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={onRequestLibrary}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.permissions.pickPhoto', 'Choose from photos')}
        >
          <Images size={18} color={theme.primary} />
          <Text style={[styles.secondaryActionText, { color: theme.textPrimary }]}>
            {t('onboarding.permissions.pickPhoto', 'Choose from photos')}
          </Text>
          <Text style={[styles.secondaryActionMeta, { color: theme.textSecondary }]}>
            {resolveStatusLabel(permissionStatusMap.library, t)}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onSkip}
          style={styles.skipButton}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.permissions.later', 'Scan later')}
        >
          <Text style={[styles.skipText, { color: theme.textSecondary }]}>
            {t('onboarding.permissions.later', 'Scan later')}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
