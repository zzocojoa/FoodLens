type IngredientLike = { isAllergen?: boolean };

export const hasAllergenIngredients = (ingredients: IngredientLike[]): boolean =>
  ingredients.some((ingredient) => ingredient.isAllergen);

export const getIngredientCountLabel = (
  ingredients: IngredientLike[],
  suffix: string = ' items'
): string => `${ingredients.length}${suffix}`;
