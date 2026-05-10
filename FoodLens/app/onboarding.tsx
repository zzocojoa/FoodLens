import React from 'react';
import { BackHandler, Platform, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Colors } from '@/constants/theme';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/features/i18n';
import { onboardingStyles as styles } from '@/features/onboarding/styles/onboarding.styles';
import { useOnboardingFlow } from '@/features/onboarding/hooks/useOnboardingFlow';
import OnboardingProgress from '@/features/onboarding/components/OnboardingProgress';
import OnboardingBackButton from '@/features/onboarding/components/OnboardingBackButton';
import OnboardingAllergyFooter from '@/features/onboarding/components/OnboardingAllergyFooter';
import WelcomeStep from '@/features/onboarding/components/steps/WelcomeStep';
import PriorityStep from '@/features/onboarding/components/steps/PriorityStep';
import PermissionsStep from '@/features/onboarding/components/steps/PermissionsStep';
import AllergiesStep from '@/features/onboarding/components/steps/AllergiesStep';
import DestinationStep from '@/features/onboarding/components/steps/DestinationStep';
import PassportCardStep from '@/features/onboarding/components/steps/PassportCardStep';
import CompleteStep from '@/features/onboarding/components/steps/CompleteStep';
import type { OnboardingCompletionTarget } from '@/features/onboarding/types/onboarding.types';
import { resolveOnboardingPreviewAccess } from '@/features/onboarding/services/onboardingPreviewService';

export default function OnboardingScreen() {
  const router = useRouter();
  const searchParams = useLocalSearchParams<{ preview?: string | string[] }>();
  const { t } = useI18n();
  const { colorScheme } = useTheme();
  const theme = Colors[colorScheme];
  const previewAccess = React.useMemo(
    () => resolveOnboardingPreviewAccess(searchParams.preview),
    [searchParams.preview]
  );
  const previewMode = previewAccess === 'preview';

  const flow = useOnboardingFlow({
    previewMode,
    onCompleted: (target: OnboardingCompletionTarget) => {
      if (previewMode && target === 'home') {
        router.replace('/');
        return;
      }
      if (target === 'scan') {
        router.replace('/scan/camera');
        return;
      }
      if (target === 'gallery') {
        router.replace({
          pathname: '/scan/camera',
          params: { openGallery: '1' },
        });
        return;
      }
      if (target === 'allergyCard') {
        router.replace('/allergies');
        return;
      }
      router.replace('/(tabs)');
    },
  });

  React.useEffect(() => {
    if (previewAccess === 'disabled_preview') {
      router.replace('/');
    }
  }, [previewAccess, router]);

  useFocusEffect(
    React.useCallback(() => {
      if (Platform.OS !== 'android') {
        return undefined;
      }

      const onBackPress = () => {
        if (flow.step > 1) {
          flow.goBack();
          return true;
        }
        if (router.canGoBack()) {
          router.back();
        }
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
      return () => {
        subscription.remove();
      };
    }, [flow, router])
  );

  if (previewAccess === 'disabled_preview') {
    return null;
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]} edges={['top', 'bottom']}>
      <OnboardingProgress step={flow.step} theme={theme} />

      {flow.step > 1 && <OnboardingBackButton onPress={flow.goBack} theme={theme} t={t} />}

      <View style={{ flex: 1 }}>
        {flow.step === 1 && (
          <WelcomeStep
            theme={theme}
            t={t}
            onStart={() => flow.goTo(2)}
          />
        )}
        {flow.step === 2 && (
          <PriorityStep
            theme={theme}
            t={t}
            priority={flow.priority}
            onSelect={flow.setPriority}
            onNext={() => flow.goTo(3)}
          />
        )}
        {flow.step === 3 && (
          <AllergiesStep
            theme={theme}
            t={t}
            selectedAllergies={flow.selectedAllergies}
            severityMap={flow.severityMap}
            onToggleAllergen={flow.toggleAllergen}
            onSetSeverity={flow.setAllergenSeverity}
            customInputValue={flow.customInputValue}
            customSuggestions={flow.customSuggestions}
            onCustomInputChange={flow.handleCustomInputChange}
            onAddCustomAllergen={flow.addCustomAllergen}
            onSelectCustomAllergenSuggestion={flow.selectCustomAllergenSuggestion}
          />
        )}
        {flow.step === 4 && (
          <DestinationStep
            theme={theme}
            t={t}
            destination={flow.destination}
            destinations={flow.destinations}
            permissionStatusMap={flow.permissionStatusMap}
            detectedLocation={flow.detectedLocation}
            locationDetecting={flow.locationDetecting}
            onSelectDestination={flow.setDestination}
            onDetectLocation={() => void flow.handleDetectLocation()}
            onNext={() => flow.goTo(5)}
          />
        )}
        {flow.step === 5 && (
          <PassportCardStep
            theme={theme}
            t={t}
            selectedAllergies={flow.selectedAllergies}
            severityMap={flow.severityMap}
            destination={flow.destination}
            onPrimary={() => flow.goTo(6)}
            onEdit={() => flow.goTo(4)}
          />
        )}
        {flow.step === 6 && (
          <PermissionsStep
            theme={theme}
            t={t}
            permissionStatusMap={flow.permissionStatusMap}
            onRequestCamera={() => void flow.handleRequestScanPermission('camera')}
            onRequestLibrary={() => void flow.handleRequestScanPermission('library')}
            onSkip={() => flow.goTo(7)}
          />
        )}
        {flow.step === 7 && (
          <CompleteStep
            theme={theme}
            t={t}
            selectedAllergies={flow.selectedAllergies}
            severityMap={flow.severityMap}
            destination={flow.destination}
            permissionStatusMap={flow.permissionStatusMap}
            scanEntryTarget={flow.scanEntryTarget}
            loading={flow.loading}
            onScan={() => void flow.handleComplete(flow.scanEntryTarget === 'gallery' ? 'gallery' : 'scan')}
            onCard={() => void flow.handleComplete('allergyCard')}
            onHome={() => void flow.handleComplete('home')}
          />
        )}
      </View>

      {flow.step === 3 && (
        <OnboardingAllergyFooter
          theme={theme}
          t={t}
          onContinue={() => flow.goTo(4)}
          onSkip={flow.handleSkip}
        />
      )}
    </SafeAreaView>
  );
}
