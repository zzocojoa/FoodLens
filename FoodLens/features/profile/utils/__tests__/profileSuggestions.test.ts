import { SEARCHABLE_INGREDIENTS } from '@/data/ingredients';
import {
  buildSuggestions,
  createCustomRestrictionValue,
  getCustomRestrictionText,
  projectRestrictionForAi,
  resolveRestrictionDisplayName,
  resolveSuggestionStorageValue,
} from '../profileSuggestions';

const translateEn = (key: string, fallback: string): string => fallback || key;

const translateKo = (key: string, fallback: string): string => {
  if (key === 'ingredients.peach') return '복숭아';
  if (key === 'ingredients.vegan') return '비건';
  return fallback || key;
};

describe('profileSuggestions', () => {
  it('returns canonical values while displaying localized labels', () => {
    const suggestions = buildSuggestions({
      keyword: '복숭아',
      searchable: SEARCHABLE_INGREDIENTS,
      selected: [],
      limit: 5,
      translate: translateKo,
    });

    expect(suggestions[0]).toEqual({
      value: 'peach',
      label: '복숭아',
    });
  });

  it('searches fallback English labels when the active locale label is Korean', () => {
    const suggestions = buildSuggestions({
      keyword: 'peach',
      searchable: SEARCHABLE_INGREDIENTS,
      selected: [],
      limit: 5,
      translate: translateKo,
    });

    expect(suggestions[0]).toEqual({
      value: 'peach',
      label: '복숭아',
    });
  });

  it('searches aliases when the active locale label is English', () => {
    const suggestions = buildSuggestions({
      keyword: '복숭아',
      searchable: SEARCHABLE_INGREDIENTS,
      selected: [],
      limit: 5,
      translate: translateEn,
    });

    expect(suggestions[0]).toEqual({
      value: 'peach',
      label: 'Peach',
    });
  });

  it('excludes selected canonical strings from canonical suggestions', () => {
    const suggestions = buildSuggestions({
      keyword: 'peach',
      searchable: SEARCHABLE_INGREDIENTS,
      selected: ['peach'],
      limit: 5,
      translate: translateEn,
    });

    expect(suggestions.some((suggestion) => suggestion.value === 'peach')).toBe(false);
  });

  it('displays canonical values through the locale i18n key', () => {
    expect(resolveRestrictionDisplayName('peach', translateKo)).toBe('복숭아');
  });

  it('stores suggestion values as canonical ingredient keys', () => {
    expect(resolveSuggestionStorageValue('peach')).toBe('peach');
    expect(() => resolveSuggestionStorageValue('Peach')).toThrow(
      'Suggestion storage value is not a known ingredient: Peach'
    );
  });

  it('stores direct free text with a custom prefix and hides it for display', () => {
    const storedValue = createCustomRestrictionValue('  my custom restriction  ');

    expect(storedValue).toBe('custom:my custom restriction');
    expect(getCustomRestrictionText(storedValue)).toBe('my custom restriction');
    expect(resolveRestrictionDisplayName(storedValue, translateKo)).toBe('my custom restriction');
  });

  it('projects canonical and custom values for AI without leaking storage prefix', () => {
    expect(projectRestrictionForAi('peach', translateKo)).toEqual({
      storedValue: 'peach',
      displayValue: '복숭아',
      aiValue: 'Peach',
      isCustomFreeText: false,
    });

    expect(projectRestrictionForAi('custom:my custom restriction', translateKo)).toEqual({
      storedValue: 'custom:my custom restriction',
      displayValue: 'my custom restriction',
      aiValue: 'my custom restriction',
      isCustomFreeText: true,
    });
  });
});
