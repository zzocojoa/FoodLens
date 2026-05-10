import { useCallback, useEffect, useState } from 'react';
import type { AllergySeverity, Gender } from '@/features/profile/types/profile.types';
import { TOTAL_STEPS } from '../constants/onboarding.constants';
import {
  DEFAULT_ONBOARDING_DESTINATION,
  ONBOARDING_DESTINATIONS,
} from '../constants/safetyPassport.constants';
import {
  getOnboardingPermissionStatuses,
  requestOnboardingPermissions,
} from '../services/onboardingPermissionService';
import { completeOnboardingProfile } from '../services/onboardingProfileService';
import type {
  OnboardingCompletionTarget,
  OnboardingDestination,
  OnboardingStep,
  PermissionRequestKind,
  PermissionStatusMap,
  SafetyPriority,
} from '../types/onboarding.types';
import { SEARCHABLE_INGREDIENTS } from '@/data/ingredients';
import {
  IngredientSuggestion,
  buildSuggestions,
  createCustomRestrictionValue,
  resolveSuggestionStorageValue,
} from '@/features/profile/utils/profileSuggestions';
import { useI18n } from '@/features/i18n';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';
import { getLocationData } from '@/services/utils';
import type { LocationData } from '@/services/utils';

type UseOnboardingFlowParams = {
  onCompleted: (target: OnboardingCompletionTarget) => void;
  previewMode: boolean;
};

type PermissionRequestFlags = {
  camera: boolean;
  library: boolean;
  location: boolean;
};

type ScanEntryTarget = 'camera' | 'gallery';

const normalizeAllergyKey = (value: string): string => value.trim().toLowerCase();

const DEFAULT_PERMISSION_STATUS: PermissionStatusMap = {
  camera: 'not_requested',
  library: 'not_requested',
  location: 'not_requested',
};

const resolveRequestFlags = (kind: PermissionRequestKind): PermissionRequestFlags => ({
  camera: kind === 'camera',
  library: kind === 'library',
  location: kind === 'location',
});

const mergePermissionStatusMap = (
  current: PermissionStatusMap,
  next: PermissionStatusMap,
  requested: PermissionRequestFlags
): PermissionStatusMap => ({
  camera: requested.camera ? next.camera : current.camera,
  library: requested.library ? next.library : current.library,
  location: requested.location ? next.location : current.location,
});

const resolveDestinationByCountryCode = (
  location: LocationData | null
): OnboardingDestination | null => {
  const countryCode = location?.isoCountryCode?.trim().toUpperCase();
  if (!countryCode) {
    return null;
  }

  return ONBOARDING_DESTINATIONS.find((destination) => destination.countryCode === countryCode) ?? null;
};

export const useOnboardingFlow = ({ onCompleted, previewMode }: UseOnboardingFlowParams) => {
  const { t } = useI18n();
  const [step, setStep] = useState<OnboardingStep>(1);
  const [priority, setPriority] = useState<SafetyPriority>('allergy');
  const [gender] = useState<Gender | null>(null);
  const [birthDate] = useState<Date | null>(null);
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [severityMap, setSeverityMap] = useState<Record<string, AllergySeverity>>({});
  const [destination, setDestination] = useState<OnboardingDestination>(DEFAULT_ONBOARDING_DESTINATION);
  const [permissionStatusMap, setPermissionStatusMap] = useState<PermissionStatusMap>(DEFAULT_PERMISSION_STATUS);
  const [loading, setLoading] = useState(false);
  const [locationDetecting, setLocationDetecting] = useState(false);
  const [scanEntryTarget, setScanEntryTarget] = useState<ScanEntryTarget>('camera');
  const [customInputValue, setCustomInputValue] = useState('');
  const [customSuggestions, setCustomSuggestions] = useState<IngredientSuggestion[]>([]);

  useEffect(() => {
    let cancelled = false;

    const preloadPermissionStatuses = async () => {
      const currentStatuses = await getOnboardingPermissionStatuses();
      if (!cancelled) {
        setPermissionStatusMap(currentStatuses);
      }
    };

    void preloadPermissionStatuses();

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleAllergen = useCallback((id: string) => {
    setCustomInputValue('');
    setCustomSuggestions([]);

    setSelectedAllergies((prev) => {
      if (prev.includes(id)) {
        setSeverityMap((map) => {
          const copy = { ...map };
          delete copy[id];
          return copy;
        });
        return prev.filter((allergenId) => allergenId !== id);
      }
      setSeverityMap((map) => ({ ...map, [id]: 'moderate' }));
      return [...prev, id];
    });
  }, []);

  const setAllergenSeverity = useCallback((id: string, severity: AllergySeverity) => {
    setSeverityMap((prev) => ({
      ...prev,
      [id]: severity,
    }));
  }, []);

  const cycleSeverity = useCallback((id: string) => {
    setSeverityMap((prev) => {
      const current = prev[id] || 'moderate';
      const next: AllergySeverity =
        current === 'mild' ? 'moderate' : current === 'moderate' ? 'severe' : 'mild';
      return { ...prev, [id]: next };
    });
  }, []);

  const handleCustomInputChange = useCallback(
    (text: string) => {
      setCustomInputValue(text);
      setCustomSuggestions(buildSuggestions({
        keyword: text,
        searchable: SEARCHABLE_INGREDIENTS,
        selected: selectedAllergies,
        limit: 5,
        translate: t,
      }));
    },
    [selectedAllergies, t]
  );

  const addAllergenStorageValue = useCallback((value: string) => {
    const item = value.trim();
    if (!item) return;

    const normalizedItem = normalizeAllergyKey(item);

    setSelectedAllergies((prev) => {
      const hasDuplicate = prev.some((existing) => normalizeAllergyKey(existing) === normalizedItem);
      if (hasDuplicate) return prev;
      setSeverityMap((map) => ({ ...map, [item]: 'moderate' }));
      return [...prev, item];
    });
    setCustomInputValue('');
    setCustomSuggestions([]);
  }, []);

  const addCustomAllergen = useCallback(
    (name: string) => {
      const item = name.trim();
      if (!item) return;
      addAllergenStorageValue(createCustomRestrictionValue(item));
    },
    [addAllergenStorageValue]
  );

  const selectCustomAllergenSuggestion = useCallback(
    (item: string) => {
      addAllergenStorageValue(resolveSuggestionStorageValue(item));
    },
    [addAllergenStorageValue]
  );

  const handleRequestScanPermission = useCallback(async (kind: PermissionRequestKind) => {
    const requestFlags = resolveRequestFlags(kind);
    const permissionResults = await requestOnboardingPermissions(
      requestFlags.camera,
      requestFlags.library,
      requestFlags.location
    );
    setPermissionStatusMap((current) => mergePermissionStatusMap(current, permissionResults, requestFlags));
    setScanEntryTarget(kind === 'library' ? 'gallery' : 'camera');
    setStep(7);
  }, []);

  const handleDetectLocation = useCallback(async () => {
    setLocationDetecting(true);
    try {
      const requestFlags = resolveRequestFlags('location');
      const permissionResults = await requestOnboardingPermissions(false, false, true);
      setPermissionStatusMap((current) => mergePermissionStatusMap(current, permissionResults, requestFlags));
      if (permissionResults.location !== 'granted') {
        showTranslatedAlert(t, {
          titleKey: 'onboarding.destination.locationDeniedTitle',
          titleFallback: 'Location not available',
          messageKey: 'onboarding.destination.locationDeniedMessage',
          messageFallback: 'Choose your destination manually to prepare the allergy card.',
        });
        return;
      }

      const location = await getLocationData();
      const detectedDestination = resolveDestinationByCountryCode(location);
      if (!detectedDestination) {
        showTranslatedAlert(t, {
          titleKey: 'onboarding.destination.locationUnsupportedTitle',
          titleFallback: 'Choose destination manually',
          messageKey: 'onboarding.destination.locationUnsupportedMessage',
          messageFallback: 'We could not match your current country to a prepared card language.',
        });
        return;
      }

      setDestination(detectedDestination);
    } finally {
      setLocationDetecting(false);
    }
  }, [t]);

  const handleComplete = useCallback(async (target: OnboardingCompletionTarget) => {
    setLoading(true);
    try {
      if (previewMode) {
        onCompleted(target);
        return;
      }
      await completeOnboardingProfile({
        gender,
        birthDate,
        selectedAllergies,
        severityMap,
        currentTripLocation: destination.currentTripLocation,
        targetLanguage: destination.targetLanguage,
        currentTripStart: new Date().toISOString(),
      });
      onCompleted(target);
    } catch {
      showTranslatedAlert(t, {
        titleKey: 'profile.alert.errorTitle',
        titleFallback: 'Error',
        messageKey: 'profile.alert.saveFailed',
        messageFallback: 'Failed to save.',
      });
    } finally {
      setLoading(false);
    }
  }, [birthDate, destination, gender, onCompleted, previewMode, selectedAllergies, severityMap, t]);

  const handleSkip = useCallback(() => {
    if (step < TOTAL_STEPS) {
      setStep((step + 1) as OnboardingStep);
      return;
    }
    void handleComplete('home');
  }, [handleComplete, step]);

  const goBack = useCallback(() => {
    if (step > 1) setStep((step - 1) as OnboardingStep);
  }, [step]);

  const goTo = useCallback((target: OnboardingStep) => setStep(target), []);

  return {
    step,
    priority,
    gender,
    birthDate,
    selectedAllergies,
    severityMap,
    destination,
    destinations: ONBOARDING_DESTINATIONS,
    permissionStatusMap,
    scanEntryTarget,
    customInputValue,
    customSuggestions,
    loading,
    locationDetecting,
    setPriority,
    setDestination,
    goTo,
    goBack,
    toggleAllergen,
    setAllergenSeverity,
    cycleSeverity,
    handleCustomInputChange,
    addCustomAllergen,
    selectCustomAllergenSuggestion,
    handleRequestScanPermission,
    handleDetectLocation,
    handleComplete,
    handleSkip,
  };
};
