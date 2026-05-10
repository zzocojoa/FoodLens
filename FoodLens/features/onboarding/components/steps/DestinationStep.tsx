import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { ArrowRight, Check, LocateFixed, MapPin } from 'lucide-react-native';
import type {
  DetectedOnboardingLocation,
  OnboardingDestination,
  PermissionStatusMap,
  Translate,
} from '../../types/onboarding.types';
import { onboardingStyles as styles } from '../../styles/onboarding.styles';

type Props = {
  theme: any;
  t: Translate;
  destination: OnboardingDestination;
  destinations: OnboardingDestination[];
  permissionStatusMap: PermissionStatusMap;
  detectedLocation: DetectedOnboardingLocation | null;
  locationDetecting: boolean;
  onSelectDestination: (destination: OnboardingDestination) => void;
  onDetectLocation: () => void;
  onNext: () => void;
};

const compactTextParts = (parts: Array<string | null>): string[] => parts.filter((part): part is string => {
  return Boolean(part);
});

const resolveDetectedLocationLabel = (detectedLocation: DetectedOnboardingLocation): string => {
  const city = detectedLocation.city?.trim() || null;
  const country = detectedLocation.country?.trim() || detectedLocation.countryCode?.trim() || null;
  const address = detectedLocation.formattedAddress?.trim() || null;
  const locationParts = compactTextParts([city, country]);

  if (locationParts.length > 0) {
    return locationParts.join(', ');
  }

  return address || detectedLocation.countryCode || '';
};

export default function DestinationStep({
  theme,
  t,
  destination,
  destinations,
  permissionStatusMap,
  detectedLocation,
  locationDetecting,
  onSelectDestination,
  onDetectLocation,
  onNext,
}: Props) {
  const locationStatus = permissionStatusMap.location;
  const detectedLocationLabel = detectedLocation ? resolveDetectedLocationLabel(detectedLocation) : null;
  const detectedCountryHasPreparedCard = Boolean(detectedLocation?.matchedDestinationId);
  const locationStatusLabel =
    locationStatus === 'granted'
      ? t('onboarding.permissions.status.granted', 'Granted')
      : locationStatus === 'denied'
        ? t('onboarding.permissions.status.denied', 'Denied')
        : locationStatus === 'unavailable'
          ? t('onboarding.permissions.status.unavailable', 'Unavailable')
          : t('onboarding.permissions.status.notRequested', 'Not requested');

  return (
    <View style={[styles.stepContainer, { justifyContent: 'space-between', paddingBottom: 24 }]}>
      <View>
        <Text style={[styles.kickerText, { color: theme.primary }]}>
          {t('onboarding.destination.kicker', 'Travel card')}
        </Text>
        <Text style={[styles.title, { color: theme.textPrimary }]}>
          {t('onboarding.destination.title', 'Where are you eating next?')}
        </Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          {t(
            'onboarding.destination.subtitle',
            'Choose a country to prepare your allergy card in the local language.',
          )}
        </Text>

        <View style={[styles.destinationMapCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <MapPin size={26} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.destinationMapTitle, { color: theme.textPrimary }]}>
              {detectedLocationLabel ?? t('onboarding.destination.manualFirst', 'Manual selection first')}
            </Text>
            <Text style={[styles.destinationMapSub, { color: theme.textSecondary }]}>
              {detectedLocation
                ? detectedCountryHasPreparedCard
                  ? t('onboarding.destination.locationMatchedSub', 'This country has a prepared card language.')
                  : t(
                    'onboarding.destination.locationFallbackSub',
                    'This country is not in quick cards yet. Your selected card language stays unchanged.',
                  )
                : t('onboarding.destination.manualFirstSub', 'Location is only requested if you tap detect.')}
            </Text>
          </View>
        </View>

        <View style={{ marginTop: 16, gap: 10 }}>
          {destinations.map((item) => {
            const selected = item.id === destination.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[
                  styles.destinationRow,
                  {
                    backgroundColor: selected ? `${theme.primary}12` : theme.surface,
                    borderColor: selected ? theme.primary : theme.border,
                  },
                ]}
                onPress={() => onSelectDestination(item)}
                activeOpacity={0.82}
                accessibilityRole="button"
                accessibilityLabel={t(item.titleKey, item.titleFallback)}
                accessibilityState={{ selected }}
              >
                <View style={[styles.destinationFlag, { backgroundColor: selected ? theme.primary : theme.border }]}>
                  <Text style={[styles.destinationFlagText, { color: selected ? '#FFFFFF' : theme.textPrimary }]}>
                    {item.countryCode}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.destinationTitle, { color: theme.textPrimary }]}>
                    {t(item.titleKey, item.titleFallback)}
                  </Text>
                  <Text style={[styles.destinationSub, { color: theme.textSecondary }]}>
                    {t(item.subtitleKey, item.subtitleFallback)}
                  </Text>
                </View>
                {selected ? <Check size={20} color={theme.primary} /> : null}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={{ gap: 10 }}>
        <TouchableOpacity
          style={[styles.secondaryActionButton, { borderColor: theme.border, backgroundColor: theme.surface }]}
          onPress={onDetectLocation}
          disabled={locationDetecting}
          activeOpacity={0.78}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.destination.detect', 'Detect current country')}
          accessibilityState={{ disabled: locationDetecting, busy: locationDetecting }}
        >
          <LocateFixed size={18} color={theme.primary} />
          <Text style={[styles.secondaryActionText, { color: theme.textPrimary }]}>
            {locationDetecting
              ? t('onboarding.destination.detecting', 'Detecting...')
              : t('onboarding.destination.detect', 'Detect current country')}
          </Text>
          <Text style={[styles.secondaryActionMeta, { color: theme.textSecondary }]}>
            {locationStatusLabel}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}
          onPress={onNext}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.destination.next', 'Preview card')}
        >
          <Text style={styles.primaryButtonText}>{t('onboarding.destination.next', 'Preview card')}</Text>
          <ArrowRight size={20} color="white" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
