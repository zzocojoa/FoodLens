import { useMemo } from 'react';
import { getAllergyAlertCardColors } from '../utils/cardPresentation';

export const useAllergyAlertCardModel = (colorScheme: 'light' | 'dark') => {
  const colors = useMemo(() => getAllergyAlertCardColors(colorScheme), [colorScheme]);

  return {
    colors,
  };
};
