import { useMemo, useState } from 'react';
import { ResultIngredient } from '../types';
import { buildIngredientsVisibleState } from '../utils/resultContentFormatters';

export const useIngredientsExpand = (ingredients: ResultIngredient[]) => {
  const [expanded, setExpanded] = useState(false);

  const state = useMemo(
    () => buildIngredientsVisibleState(ingredients, expanded),
    [ingredients, expanded]
  );

  const toggleExpanded = () => setExpanded((prev) => !prev);

  return {
    expanded,
    state,
    toggleExpanded,
  };
};
