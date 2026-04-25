import {
    SearchableIngredient,
    findSearchableIngredientByValue,
    getIngredientI18nKey,
} from '@/data/ingredients';

export type IngredientSuggestion = Readonly<{
    value: string;
    label: string;
}>;

export const CUSTOM_RESTRICTION_PREFIX = 'custom:';

export type CustomRestrictionValue = `${typeof CUSTOM_RESTRICTION_PREFIX}${string}`;

export type AiRestrictionProjection = Readonly<{
    storedValue: string;
    displayValue: string;
    aiValue: string;
    isCustomFreeText: boolean;
}>;

type BuildSuggestionsParams = Readonly<{
    keyword: string;
    searchable: readonly SearchableIngredient[];
    selected: readonly string[];
    limit: number;
    translate: (key: string, fallback: string) => string;
}>;

const normalizeSearchToken = (value: string): string => value.trim().toLowerCase();

const normalizeCustomRestrictionText = (value: string): string => value.trim();

const findIngredientBySuggestionValue = (value: string): SearchableIngredient | null => {
    const normalized = normalizeCustomRestrictionText(value);
    if (!normalized) return null;
    return findSearchableIngredientByValue(normalized);
};

const getSelectedIngredientKeys = (selected: readonly string[]): Set<string> =>
    new Set(
        selected
            .map((item) => findIngredientBySuggestionValue(item)?.key ?? item.trim())
            .filter((item) => item.length > 0),
    );

const getSuggestionSearchTokens = (
    ingredient: SearchableIngredient,
    label: string,
): readonly string[] => [
    label,
    ingredient.defaultLabel,
    ...ingredient.aliases,
];

const matchesQuery = (tokens: readonly string[], query: string): boolean =>
    tokens.some((token) => normalizeSearchToken(token).includes(query));

export const isCustomRestrictionValue = (value: string): value is CustomRestrictionValue =>
    value.startsWith(CUSTOM_RESTRICTION_PREFIX);

export const getCustomRestrictionText = (value: CustomRestrictionValue): string => {
    const text = value.slice(CUSTOM_RESTRICTION_PREFIX.length).trim();
    if (!text) {
        throw new Error('Custom restriction value is missing text.');
    }
    return text;
};

export const createCustomRestrictionValue = (value: string): CustomRestrictionValue => {
    const text = normalizeCustomRestrictionText(value);
    if (!text) {
        throw new Error('Custom restriction text must not be empty.');
    }
    return `${CUSTOM_RESTRICTION_PREFIX}${text}`;
};

export const resolveSuggestionStorageValue = (value: string): string => {
    const text = normalizeCustomRestrictionText(value);
    if (!text) {
        throw new Error('Suggestion storage value must not be empty.');
    }
    if (isCustomRestrictionValue(text)) {
        return text;
    }
    const ingredient = findIngredientBySuggestionValue(text);
    if (!ingredient) {
        throw new Error(`Suggestion storage value is not a known ingredient: ${text}`);
    }
    return ingredient.key;
};

export const getRestrictionDefaultLabel = (value: string): string => {
    if (isCustomRestrictionValue(value)) return getCustomRestrictionText(value);
    return findIngredientBySuggestionValue(value)?.defaultLabel ?? value.trim();
};

export const resolveRestrictionDisplayName = (
    value: string,
    translate: (key: string, fallback: string) => string,
): string => {
    if (isCustomRestrictionValue(value)) return getCustomRestrictionText(value);
    const ingredient = findIngredientBySuggestionValue(value);
    if (!ingredient) return value;
    return translate(getIngredientI18nKey(ingredient.key), ingredient.defaultLabel);
};

export const projectRestrictionForAi = (
    value: string,
    translate: (key: string, fallback: string) => string,
): AiRestrictionProjection => {
    if (isCustomRestrictionValue(value)) {
        const displayValue = getCustomRestrictionText(value);
        return {
            storedValue: value,
            displayValue,
            aiValue: displayValue,
            isCustomFreeText: true,
        };
    }

    const ingredient = findIngredientBySuggestionValue(value);
    if (!ingredient) {
        const displayValue = normalizeCustomRestrictionText(value);
        if (!displayValue) {
            throw new Error('AI restriction projection value must not be empty.');
        }
        return {
            storedValue: value,
            displayValue,
            aiValue: displayValue,
            isCustomFreeText: true,
        };
    }

    return {
        storedValue: ingredient.key,
        displayValue: translate(getIngredientI18nKey(ingredient.key), ingredient.defaultLabel),
        aiValue: ingredient.defaultLabel,
        isCustomFreeText: false,
    };
};

export const buildSuggestions = ({
    keyword,
    searchable,
    selected,
    limit,
    translate,
}: BuildSuggestionsParams): IngredientSuggestion[] => {
    const query = normalizeSearchToken(keyword);
    if (!query) return [];

    const selectedKeys = getSelectedIngredientKeys(selected);

    return searchable
        .map((ingredient) => ({
            ingredient,
            label: translate(getIngredientI18nKey(ingredient.key), ingredient.defaultLabel),
        }))
        .filter(({ ingredient, label }) =>
            !selectedKeys.has(ingredient.key) &&
            matchesQuery(getSuggestionSearchTokens(ingredient, label), query)
        )
        .slice(0, limit)
        .map(({ ingredient, label }) => ({
            value: ingredient.key,
            label,
        }));
};
