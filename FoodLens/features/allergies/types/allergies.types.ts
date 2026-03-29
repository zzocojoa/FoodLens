import { Colors } from '../../../constants/theme';
import { AllergySeverity } from '@/features/profile/types/profile.types';

export type AllergiesTheme = typeof Colors.light;

export type AllergiesState = {
    allergies: string[];
    dietaryRestrictions: string[];
    severityMap: Record<string, AllergySeverity>;
    loading: boolean;
};
