import { ResultIngredient, ResultTheme } from '../types';

export const getIngredientMetaText = (
  ingredient: ResultIngredient,
  allergenLabel: string = 'Allergen detected',
  healthyLabel: string = 'Healthy component'
): string => (ingredient.isAllergen ? allergenLabel : healthyLabel);

export const getIngredientNameColor = (ingredient: ResultIngredient, theme: ResultTheme): string =>
  ingredient.isAllergen ? '#881337' : theme.textPrimary;

export const getIngredientIconColor = (ingredient: ResultIngredient, theme: ResultTheme): string =>
  ingredient.isAllergen ? '#E11D48' : theme.textSecondary;
