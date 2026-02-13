import { INGREDIENTS_INITIAL_LIMIT } from '../constants';
import { ResultIngredient, ResultLocationData } from '../types';
import { formatDateTime } from '@/features/i18n/services/formatService';

export const formatTimestamp = (timestamp: string, locale?: string): string =>
    formatDateTime(timestamp, locale);

export const getLocationText = (
    locationData: ResultLocationData,
    noLocationLabel: string = 'No Location Info'
): string =>
    locationData?.formattedAddress ||
    [locationData?.city, locationData?.country].filter(Boolean).join(', ') ||
    noLocationLabel;

export const sortIngredientsByRisk = (ingredients: ResultIngredient[]): ResultIngredient[] =>
    [...ingredients].sort((a, b) => (b.isAllergen ? 1 : 0) - (a.isAllergen ? 1 : 0));

export const buildIngredientsVisibleState = (
    ingredients: ResultIngredient[],
    expanded: boolean
): { visible: ResultIngredient[]; hiddenCount: number; shouldCollapse: boolean } => {
    const sorted = sortIngredientsByRisk(ingredients);
    const shouldCollapse = sorted.length > INGREDIENTS_INITIAL_LIMIT;
    const visible = expanded || !shouldCollapse ? sorted : sorted.slice(0, INGREDIENTS_INITIAL_LIMIT);
    const hiddenCount = sorted.length - INGREDIENTS_INITIAL_LIMIT;

    return { visible, hiddenCount, shouldCollapse };
};
