export const getIngredientExpandLabel = (expanded: boolean, hiddenCount: number): string =>
  expanded ? '접기' : `더 보기 (+${hiddenCount})`;
