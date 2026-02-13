import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { ResultContentProps } from '../types';
import { hasAllergenIngredients } from '../utils/contentMeta';
import { formatTimestamp, getLocationText } from '../utils/resultContentFormatters';

export const useResultContentModel = (
  result: ResultContentProps['result'],
  locationData: ResultContentProps['locationData'],
  timestamp?: string | null
) => {
  const colorScheme = useColorScheme() ?? 'light';
  const theme = Colors[colorScheme];

  return {
    colorScheme,
    theme,
    hasAllergens: hasAllergenIngredients(result.ingredients),
    locationText: getLocationText(locationData),
    formattedTimestamp: timestamp ? formatTimestamp(timestamp) : null,
  };
};
