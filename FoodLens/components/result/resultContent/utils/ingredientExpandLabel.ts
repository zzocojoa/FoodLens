export const getIngredientExpandLabel = (
  expanded: boolean,
  hiddenCount: number,
  collapseLabel: string = 'Collapse',
  moreTemplate: string = 'Show more (+{count})'
): string =>
  expanded ? collapseLabel : moreTemplate.replace('{count}', String(hiddenCount));
