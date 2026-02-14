import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ResultContentProps } from '../types';
import { hasAllergenIngredients } from '../utils/contentMeta';
import { formatTimestamp, getLocationText } from '../utils/resultContentFormatters';
import {
  resolveLocalizedFoodName,
  resolveLocalizedIngredientName,
  resolveLocalizedSummary,
} from '../utils/localizedNames';

export const useResultContentModel = (
  result: ResultContentProps['result'],
  locationData: ResultContentProps['locationData'],
  timestamp?: string | null,
  t?: (key: string, fallback?: string) => string,
  locale?: string
) => {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return {
    colorScheme,
    theme,
    hasAllergens: hasAllergenIngredients(result.ingredients),
    localizedFoodName: resolveLocalizedFoodName(result, locale),
    localizedSummary: resolveLocalizedSummary(result, locale),
    localizedIngredients: result.ingredients.map((ingredient) => ({
      ...ingredient,
      displayName: resolveLocalizedIngredientName(ingredient, locale),
    })),
    locationText: getLocationText(
      locationData,
      t?.('result.location.none', 'No Location Info') ?? 'No Location Info',
      locale
    ),
    formattedTimestamp: timestamp ? formatTimestamp(timestamp, locale) : null,
  };
};
