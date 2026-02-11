import { Dimensions } from 'react-native';

export const { height: SCREEN_HEIGHT } = Dimensions.get('window');
export const SHEET_HEIGHT = SCREEN_HEIGHT * 0.85;
export const DISMISS_THRESHOLD = 150;
export const INGREDIENT_MACRO_KEYS = ['protein', 'carbs', 'fat'] as const;
