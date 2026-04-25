import {
    buildIngredientsVisibleState,
    getLocationText,
    sortIngredientsByRisk,
} from '../resultContentFormatters';

describe('resultContentFormatters', () => {
    it('returns formatted location address', () => {
        expect(getLocationText({ formattedAddress: 'Seoul, KR' })).toBe('Seoul, KR');
        expect(getLocationText({ city: 'Busan', country: 'KR' })).toBe('Busan, KR');
        expect(getLocationText({})).toBe('No Location Info');
    });

    it('sorts allergens first', () => {
        const sorted = sortIngredientsByRisk([
            { name: 'A', isAllergen: false },
            { name: 'B', isAllergen: true },
        ]);
        expect(sorted[0].name).toBe('B');
        expect(sorted[1].name).toBe('A');
    });

    it('builds collapsed ingredient state', () => {
        const items = Array.from({ length: 7 }, (_, i) => ({ name: String(i), isAllergen: false }));
        const state = buildIngredientsVisibleState(items, false);

        expect(state.shouldCollapse).toBe(true);
        expect(state.visible).toHaveLength(4);
        expect(state.hiddenCount).toBe(3);
    });

    it('does not report hidden ingredients when list is below collapse limit', () => {
        const items = Array.from({ length: 3 }, (_, i) => ({ name: String(i), isAllergen: false }));
        const state = buildIngredientsVisibleState(items, false);

        expect(state.shouldCollapse).toBe(false);
        expect(state.visible).toHaveLength(3);
        expect(state.hiddenCount).toBe(0);
    });
});
