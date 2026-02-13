import { ResultIngredient, ResultTheme } from '../types';

export const getIngredientMetaText = (ingredient: ResultIngredient): string =>
  ingredient.isAllergen ? 'Allergen detected' : 'Healthy component';

export const getIngredientNameColor = (ingredient: ResultIngredient, theme: ResultTheme): string =>
  ingredient.isAllergen ? '#881337' : theme.textPrimary;

export const getIngredientIconColor = (ingredient: ResultIngredient, theme: ResultTheme): string =>
  ingredient.isAllergen ? '#E11D48' : theme.textSecondary;
