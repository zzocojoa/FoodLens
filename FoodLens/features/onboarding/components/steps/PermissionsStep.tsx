import React from 'react';
import { Text, TouchableOpacity, View, Switch } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { onboardingStyles as styles } from '../../styles/onboarding.styles';
import type { Translate } from '../../types/onboarding.types';

type Props = {
  theme: any;
  t: Translate;
  cameraAllowed: boolean;
  libraryAllowed: boolean;
  locationAllowed: boolean;
  onSetCamera: (value: boolean) => void;
  onSetLibrary: (value: boolean) => void;
  onSetLocation: (value: boolean) => void;
  onAllow: (camera: boolean, library: boolean, location: boolean) => void;
  onSkip: () => void;
};

export default function PermissionsStep({
  theme,
  t,
  cameraAllowed,
  libraryAllowed,
  locationAllowed,
  onSetCamera,
  onSetLibrary,
  onSetLocation,
  onAllow,
  onSkip,
}: Props) {

  return (
    <View style={styles.stepContainer}>
      <View style={styles.heroArea}>
        {/* Hero visualization - mimicking the HTML's 3D icon look with available icons */}
        <View style={{ marginBottom: 24, alignItems: 'center' }}>
            <View style={{ 
                width: 120, height: 120, borderRadius: 30, 
                backgroundColor: theme.surface, 
                alignItems: 'center', justifyContent: 'center',
                shadowColor: theme.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 10,
                borderWidth: 1, borderColor: theme.border
            }}>
                <Ionicons name="camera" size={60} color={theme.primary} />
                <View style={{
                    position: 'absolute', top: -10, right: -10,
                    width: 40, height: 40, borderRadius: 12,
                    backgroundColor: theme.surface,
                    alignItems: 'center', justifyContent: 'center',
                    borderWidth: 1, borderColor: theme.border,
                    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4
                }}>
                     <Ionicons name="images" size={20} color={theme.textSecondary} />
                </View>
            </View>
        </View>

        <Text style={[styles.welcomeTitle, { color: theme.textPrimary }]}>
          {t('onboarding.permissions.title', "Let's set up your lens")}
        </Text>
        <Text style={[styles.welcomeSubtitle, { color: theme.textSecondary }]}>
          {t(
            'onboarding.permissions.subtitle',
            'To protect you from allergens, our AI needs to see what you eat.',
          )}
        </Text>
      </View>

      <View style={[styles.permissionCard, { backgroundColor: theme.surface, borderColor: theme.border, borderWidth: 1 }]}>
        {/* Camera Permission */}
        <View style={styles.permissionRow}>
          <View style={[styles.permissionIcon, { backgroundColor: `${theme.primary}20` }]}>
            <Ionicons name="videocam" size={28} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.permissionTitle, { color: theme.textPrimary }]}>
              {t('onboarding.permissions.camera', 'Camera Access')}
            </Text>
            <Text style={[styles.permissionDesc, { color: theme.textSecondary }]}>
              {t('onboarding.permissions.cameraDesc', 'To scan real-time meals')}
            </Text>
          </View>
          <Switch
            value={cameraAllowed}
            onValueChange={onSetCamera}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor={'white'}
            accessibilityLabel={t('onboarding.permissions.camera', 'Camera Access')}
            accessibilityHint={t('onboarding.permissions.cameraDesc', 'To scan real-time meals')}
          />
        </View>

        {/* Library Permission */}
        <View style={[styles.permissionRow, { marginTop: 16 }]}>
          <View style={[styles.permissionIcon, { backgroundColor: `${theme.textSecondary}20` }]}>
            <Ionicons name="images" size={28} color={theme.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.permissionTitle, { color: theme.textPrimary }]}>
              {t('onboarding.permissions.gallery', 'Photo Library')}
            </Text>
            <Text style={[styles.permissionDesc, { color: theme.textSecondary }]}>
              {t('onboarding.permissions.galleryDesc', 'To analyze saved photos')}
            </Text>
          </View>
          <Switch
            value={libraryAllowed}
            onValueChange={onSetLibrary}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor={'white'}
            accessibilityLabel={t('onboarding.permissions.gallery', 'Photo Library')}
            accessibilityHint={t('onboarding.permissions.galleryDesc', 'To analyze saved photos')}
          />
        </View>

        {/* Location Permission */}
        <View style={[styles.permissionRow, { marginTop: 16 }]}>
          <View style={[styles.permissionIcon, { backgroundColor: `${theme.primary}20` }]}>
            <Ionicons name="location" size={28} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.permissionTitle, { color: theme.textPrimary }]}>
              {t('onboarding.permissions.location', 'Location Access')}
            </Text>
            <Text style={[styles.permissionDesc, { color: theme.textSecondary }]}>
              {t('onboarding.permissions.locationDesc', 'To detect your current travel country')}
            </Text>
          </View>
          <Switch
            value={locationAllowed}
            onValueChange={onSetLocation}
            trackColor={{ false: theme.border, true: theme.primary }}
            thumbColor={'white'}
            accessibilityLabel={t('onboarding.permissions.location', 'Location Access')}
            accessibilityHint={t('onboarding.permissions.locationDesc', 'To detect your current travel country')}
          />
        </View>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: theme.primary }]}
        onPress={() => onAllow(cameraAllowed, libraryAllowed, locationAllowed)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.permissions.allow', 'Allow Access')}
        accessibilityHint={t('onboarding.accessibility.permissionsAllowHint', 'Request selected permissions from iPhone')}
      >
        <Text style={styles.primaryButtonText}>{t('onboarding.permissions.allow', 'Allow Access')}</Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        onPress={onSkip}
        style={styles.skipButton}
        accessibilityRole="button"
        accessibilityLabel={t('onboarding.skip', 'Maybe Later')}
        accessibilityHint={t('onboarding.accessibility.skipHint', 'Skip this step and continue')}
      >
        <Text style={[styles.skipText, { color: theme.textSecondary }]}>
          {t('onboarding.skip', 'Maybe Later')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
