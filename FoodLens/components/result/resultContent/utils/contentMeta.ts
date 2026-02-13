type IngredientLike = { isAllergen?: boolean };

export const hasAllergenIngredients = (ingredients: IngredientLike[]): boolean =>
  ingredients.some((ingredient) => ingredient.isAllergen);

export const getIngredientCountLabel = (ingredients: IngredientLike[]): string =>
  `${ingredients.length}개`;
