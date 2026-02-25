import React from 'react';
import { Platform, Switch, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
  const { height: screenHeight } = useWindowDimensions();
  const usableHeight = Math.max(1, screenHeight - Math.max(0, insets.top) - Math.max(0, insets.bottom));
  const platformScaleBias = Platform.OS === 'android' ? 0.96 : 1;
  const fitScale = Math.max(0.76, Math.min(1, (usableHeight / 812) * platformScaleBias));
  const heroBoxSize = Math.round(120 * fitScale);
  const heroIconSize = Math.max(40, Math.round(60 * fitScale));
  const heroBadgeSize = Math.max(28, Math.round(40 * fitScale));
  const heroBadgeIconSize = Math.max(14, Math.round(20 * fitScale));
  const heroMarginBottom = Math.max(14, Math.round(24 * fitScale));
  const cardPadding = Math.max(14, Math.round(20 * fitScale));
  const cardGap = Math.max(10, Math.round(16 * fitScale));
  const cardBottom = Math.max(14, Math.round(24 * fitScale));
  const sectionIconSize = Math.max(20, Math.round(28 * fitScale));
  const sectionIconBoxSize = Math.max(42, Math.round(52 * fitScale));
  const titleSize = Math.max(30, Math.round(34 * fitScale));
  const subtitleSize = Math.max(14, Math.round(17 * fitScale));
  const subtitleLineHeight = Math.max(20, Math.round(24 * fitScale));
  const primaryVerticalPadding = Math.max(14, Math.round(18 * fitScale));
  const bottomSafePadding = Math.max(
    Platform.OS === 'android' ? 8 : 10,
    insets.bottom + (Platform.OS === 'android' ? 4 : 8),
  );

  return (
    <View style={[styles.stepContainer, { justifyContent: 'flex-start', paddingBottom: bottomSafePadding }]}>
      <View style={{ flex: 1 }}>
        <View style={[styles.heroArea, { marginBottom: heroMarginBottom }]}>
          <View style={{ marginBottom: heroMarginBottom, alignItems: 'center' }}>
            <View
              style={{
                width: heroBoxSize,
                height: heroBoxSize,
                borderRadius: Math.round(heroBoxSize * 0.25),
                backgroundColor: theme.surface,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: theme.primary,
                shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.3,
                shadowRadius: 20,
                elevation: 10,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Ionicons name="camera" size={heroIconSize} color={theme.primary} />
              <View
                style={{
                  position: 'absolute',
                  top: Math.round(-10 * fitScale),
                  right: Math.round(-10 * fitScale),
                  width: heroBadgeSize,
                  height: heroBadgeSize,
                  borderRadius: Math.round(heroBadgeSize * 0.3),
                  backgroundColor: theme.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: theme.border,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.1,
                  shadowRadius: 4,
                }}
              >
                <Ionicons name="images" size={heroBadgeIconSize} color={theme.textSecondary} />
              </View>
            </View>
          </View>

          <Text style={[styles.welcomeTitle, { color: theme.textPrimary, fontSize: titleSize }]}>
            {t('onboarding.permissions.title', "Let's set up your lens")}
          </Text>
          <Text
            style={[
              styles.welcomeSubtitle,
              {
                color: theme.textSecondary,
                fontSize: subtitleSize,
                lineHeight: subtitleLineHeight,
              },
            ]}
          >
            {t(
              'onboarding.permissions.subtitle',
              'To protect you from allergens, our AI needs to see what you eat.',
            )}
          </Text>
        </View>

        <View
          style={[
            styles.permissionCard,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
              borderWidth: 1,
              padding: cardPadding,
              gap: cardGap,
              marginBottom: cardBottom,
            },
          ]}
        >
        {/* Camera Permission */}
        <View style={styles.permissionRow}>
          <View
            style={[
              styles.permissionIcon,
              {
                backgroundColor: `${theme.primary}20`,
                width: sectionIconBoxSize,
                height: sectionIconBoxSize,
                borderRadius: Math.round(sectionIconBoxSize * 0.3),
              },
            ]}
          >
            <Ionicons name="videocam" size={sectionIconSize} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.permissionTitle, { color: theme.textPrimary, fontSize: Math.max(15, Math.round(17 * fitScale)) }]}>
              {t('onboarding.permissions.camera', 'Camera Access')}
            </Text>
            <Text style={[styles.permissionDesc, { color: theme.textSecondary, fontSize: Math.max(12, Math.round(14 * fitScale)) }]}>
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
        <View style={[styles.permissionRow, { marginTop: cardGap }]}>
          <View
            style={[
              styles.permissionIcon,
              {
                backgroundColor: `${theme.textSecondary}20`,
                width: sectionIconBoxSize,
                height: sectionIconBoxSize,
                borderRadius: Math.round(sectionIconBoxSize * 0.3),
              },
            ]}
          >
            <Ionicons name="images" size={sectionIconSize} color={theme.textSecondary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.permissionTitle, { color: theme.textPrimary, fontSize: Math.max(15, Math.round(17 * fitScale)) }]}>
              {t('onboarding.permissions.gallery', 'Photo Library')}
            </Text>
            <Text style={[styles.permissionDesc, { color: theme.textSecondary, fontSize: Math.max(12, Math.round(14 * fitScale)) }]}>
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
        <View style={[styles.permissionRow, { marginTop: cardGap }]}>
          <View
            style={[
              styles.permissionIcon,
              {
                backgroundColor: `${theme.primary}20`,
                width: sectionIconBoxSize,
                height: sectionIconBoxSize,
                borderRadius: Math.round(sectionIconBoxSize * 0.3),
              },
            ]}
          >
            <Ionicons name="location" size={sectionIconSize} color={theme.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.permissionTitle, { color: theme.textPrimary, fontSize: Math.max(15, Math.round(17 * fitScale)) }]}>
              {t('onboarding.permissions.location', 'Location Access')}
            </Text>
            <Text style={[styles.permissionDesc, { color: theme.textSecondary, fontSize: Math.max(12, Math.round(14 * fitScale)) }]}>
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
      </View>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          {
            backgroundColor: theme.primary,
            paddingVertical: primaryVerticalPadding,
          },
        ]}
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
        style={[styles.skipButton, { marginTop: Math.max(8, Math.round(14 * fitScale)) }]}
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
