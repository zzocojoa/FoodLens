import { useCallback, useEffect, useState } from 'react';
import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { AllergySeverity, Gender } from '@/features/profile/types/profile.types';
import { TOTAL_STEPS, DEFAULT_BIRTH_DATE } from '../constants/onboarding.constants';
import {
  getOnboardingPermissionStatuses,
  requestOnboardingPermissions,
} from '../services/onboardingPermissionService';
import { completeOnboardingProfile } from '../services/onboardingProfileService';
import type { OnboardingStep, PermissionStatusMap } from '../types/onboarding.types';
import { SEARCHABLE_INGREDIENTS } from '@/data/ingredients';
import { buildSuggestions } from '@/features/profile/utils/profileSuggestions';
import { useI18n } from '@/features/i18n';
import { showTranslatedAlert } from '@/services/ui/uiAlerts';

type UseOnboardingFlowParams = {
  onCompleted: () => void;
};

const normalizeAllergyKey = (value: string) => value.trim().toLowerCase();
const DEFAULT_PERMISSION_STATUS: PermissionStatusMap = {
  camera: 'not_requested',
  library: 'not_requested',
  location: 'not_requested',
};

export const useOnboardingFlow = ({ onCompleted }: UseOnboardingFlowParams) => {
  const { t } = useI18n();
  const [step, setStep] = useState<OnboardingStep>(1);
  const [gender, setGender] = useState<Gender | null>(null);
  const [birthDate, setBirthDate] = useState<Date>(DEFAULT_BIRTH_DATE);
  const [selectedAllergies, setSelectedAllergies] = useState<string[]>([]);
  const [severityMap, setSeverityMap] = useState<Record<string, AllergySeverity>>({});
  const [cameraAllowed, setCameraAllowed] = useState(true);
  const [libraryAllowed, setLibraryAllowed] = useState(false);
  const [locationAllowed, setLocationAllowed] = useState(true);
  const [permissionStatusMap, setPermissionStatusMap] = useState<PermissionStatusMap>(DEFAULT_PERMISSION_STATUS);
  const [loading, setLoading] = useState(false);
  const [customInputValue, setCustomInputValue] = useState('');
  const [customSuggestions, setCustomSuggestions] = useState<string[]>([]);

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
    // Clear search when toggling from grid
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
      setCustomSuggestions(buildSuggestions(text, SEARCHABLE_INGREDIENTS, selectedAllergies));
    },
    [selectedAllergies]
  );

  const addCustomAllergen = useCallback(
    (name: string) => {
      const item = name.trim();
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
    },
    []
  );

  const handleRequestPermissions = useCallback(async (camera: boolean, library: boolean, location: boolean) => {
    const permissionResults = await requestOnboardingPermissions(camera, library, location);
    setPermissionStatusMap(permissionResults);
    setStep(4);
  }, []);

  const handleSkipPermissions = useCallback(() => {
    setPermissionStatusMap({
      camera: 'not_requested',
      library: 'not_requested',
      location: 'not_requested',
    });
    setStep(4);
  }, []);

  const handleComplete = useCallback(async () => {
    setLoading(true);
    try {
      await completeOnboardingProfile({
        gender,
        birthDate,
        selectedAllergies,
        severityMap,
      });
      onCompleted();
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
  }, [birthDate, gender, onCompleted, selectedAllergies, severityMap, t]);

  const handleBirthDateChange = useCallback((_event: DateTimePickerEvent, date?: Date) => {
    if (date) setBirthDate(date);
  }, []);

  const handleSkip = useCallback(() => {
    if (step < TOTAL_STEPS) {
      setStep((step + 1) as OnboardingStep);
      return;
    }
    void handleComplete();
  }, [handleComplete, step]);

  const goBack = useCallback(() => {
    if (step > 1) setStep((step - 1) as OnboardingStep);
  }, [step]);

  const goTo = useCallback((target: OnboardingStep) => setStep(target), []);

  return {
    step,
    gender,
    birthDate,
    selectedAllergies,
    severityMap,
    cameraAllowed,
    libraryAllowed,
    locationAllowed,
    permissionStatusMap,
    customInputValue,
    customSuggestions,
    loading,
    setGender,
    setCameraAllowed,
    setLibraryAllowed,
    setLocationAllowed,
    goTo,
    goBack,
    toggleAllergen,
    cycleSeverity,
    handleCustomInputChange,
    addCustomAllergen,
    handleRequestPermissions,
    handleSkipPermissions,
    handleComplete,
    handleBirthDateChange,
    handleSkip,
  };
};
