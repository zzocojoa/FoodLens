import React from 'react';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/features/i18n';
import { onboardingStyles as styles } from '@/features/onboarding/styles/onboarding.styles';
import { useOnboardingFlow } from '@/features/onboarding/hooks/useOnboardingFlow';
import { useOnboardingBadgesAnimation } from '@/features/onboarding/hooks/useOnboardingBadgesAnimation';
import OnboardingProgress from '@/features/onboarding/components/OnboardingProgress';
import OnboardingBackButton from '@/features/onboarding/components/OnboardingBackButton';
import OnboardingAllergyFooter from '@/features/onboarding/components/OnboardingAllergyFooter';
import WelcomeStep from '@/features/onboarding/components/steps/WelcomeStep';
import ProfileStep from '@/features/onboarding/components/steps/ProfileStep';
import PermissionsStep from '@/features/onboarding/components/steps/PermissionsStep';
import AllergiesStep from '@/features/onboarding/components/steps/AllergiesStep';
import CompleteStep from '@/features/onboarding/components/steps/CompleteStep';

export default function OnboardingScreen() {
  const router = useRouter();
  const { t, locale } = useI18n();
  const { colorScheme } = useTheme();
  const theme = Colors[colorScheme];
  const { badgeRightStyle, badgeLeftStyle } = useOnboardingBadgesAnimation();
  const flow = useOnboardingFlow({
    onCompleted: () => router.replace('/(tabs)'),
  });

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
      <OnboardingProgress step={flow.step} theme={theme} />

      {flow.step > 1 && <OnboardingBackButton onPress={flow.goBack} theme={theme} t={t} />}

      <View style={{ flex: 1 }}>
        {flow.step === 1 && (
          <WelcomeStep
            theme={theme}
            t={t}
            badgeRightStyle={badgeRightStyle}
            badgeLeftStyle={badgeLeftStyle}
            onStart={() => flow.goTo(2)}
          />
        )}
        {flow.step === 2 && (
          <ProfileStep
            theme={theme}
            colorScheme={colorScheme}
            locale={locale}
            t={t}
            gender={flow.gender}
            birthDate={flow.birthDate}
            onSelectGender={flow.setGender}
            onBirthDateChange={flow.handleBirthDateChange}
            onNext={() => flow.goTo(3)}
            onSkip={() => flow.goTo(3)}
          />
        )}
        {flow.step === 3 && (
          <PermissionsStep
            theme={theme}
            t={t}
            cameraAllowed={flow.cameraAllowed}
            libraryAllowed={flow.libraryAllowed}
            locationAllowed={flow.locationAllowed}
            onSetCamera={flow.setCameraAllowed}
            onSetLibrary={flow.setLibraryAllowed}
            onSetLocation={flow.setLocationAllowed}
            onAllow={(camera, library, location) => void flow.handleRequestPermissions(camera, library, location)}
            onSkip={flow.handleSkipPermissions}
          />
        )}
        {flow.step === 4 && (
          <AllergiesStep
            theme={theme}
            t={t}
            selectedAllergies={flow.selectedAllergies}
            severityMap={flow.severityMap}
            onToggleAllergen={flow.toggleAllergen}
            onCycleSeverity={flow.cycleSeverity}
            customInputValue={flow.customInputValue}
            customSuggestions={flow.customSuggestions}
            onCustomInputChange={flow.handleCustomInputChange}
            onAddCustomAllergen={flow.addCustomAllergen}
          />
        )}
        {flow.step === 5 && (
          <CompleteStep
            theme={theme}
            t={t}
            selectedAllergies={flow.selectedAllergies}
            severityMap={flow.severityMap}
            gender={flow.gender}
            birthDate={flow.birthDate}
            permissionStatusMap={flow.permissionStatusMap}
            loading={flow.loading}
            onComplete={() => void flow.handleComplete()}
          />
        )}
      </View>

      {flow.step === 4 && (
        <OnboardingAllergyFooter
          theme={theme}
          t={t}
          onContinue={() => flow.goTo(5)}
          onSkip={flow.handleSkip}
        />
      )}
    </SafeAreaView>
  );
}
