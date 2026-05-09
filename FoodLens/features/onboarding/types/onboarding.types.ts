import type { AnimatedStyle } from 'react-native-reanimated';
import type { AllergySeverity, Gender } from '@/features/profile/types/profile.types';
import type { ResolvedLocale } from '@/features/i18n/types';
import type { PermissionResultStatus } from '../services/onboardingPermissionService';

export type OnboardingStep = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type SafetyPriority = 'allergy' | 'diet' | 'travel';

export type OnboardingDestination = {
  id: string;
  countryCode: string;
  currentTripLocation: string;
  targetLanguage: ResolvedLocale;
  titleKey: string;
  titleFallback: string;
  subtitleKey: string;
  subtitleFallback: string;
  languageLabelKey: string;
  languageLabelFallback: string;
};

export type PermissionRequestKind = 'camera' | 'library' | 'location';

export type OnboardingCompletionTarget = 'home' | 'scan' | 'gallery' | 'allergyCard';

export type Translate = (key: string, fallback?: string) => string;

export type SeverityMap = Record<string, AllergySeverity>;
export type PermissionStatusMap = Record<'camera' | 'library' | 'location', PermissionResultStatus>;

export type BadgeAnimatedStyle = AnimatedStyle<{ transform: { translateY: number }[] }>;

export type CompletePayload = {
  gender: Gender | null;
  birthDate: Date | null;
  selectedAllergies: string[];
  severityMap: SeverityMap;
  currentTripLocation: string | null;
  targetLanguage: ResolvedLocale | null;
  currentTripStart: string | null;
};

export type BirthDateSelectHandler = (date: Date) => void;
