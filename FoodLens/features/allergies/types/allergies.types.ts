import { Colors } from '../../../constants/theme';

export type AllergiesTheme = typeof Colors.light;

export type AllergiesState = {
    allergies: string[];
    loading: boolean;
};

