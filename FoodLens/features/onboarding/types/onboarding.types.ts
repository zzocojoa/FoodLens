import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import type { AnimatedStyle } from 'react-native-reanimated';
import type { AllergySeverity, Gender } from '@/features/profile/types/profile.types';
import type { PermissionResultStatus } from '../services/onboardingPermissionService';

export type OnboardingStep = 1 | 2 | 3 | 4 | 5;

export type Translate = (key: string, fallback?: string) => string;

export type SeverityMap = Record<string, AllergySeverity>;
export type PermissionStatusMap = Record<'camera' | 'library' | 'location', PermissionResultStatus>;

export type BadgeAnimatedStyle = AnimatedStyle<{ transform: { translateY: number }[] }>;

export type CompletePayload = {
  gender: Gender | null;
  birthDate: Date;
  selectedAllergies: string[];
  severityMap: SeverityMap;
};

export type BirthDateChangeHandler = (_event: DateTimePickerEvent, date?: Date) => void;
