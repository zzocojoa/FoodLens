/// <reference types="jest" />

import { mergeAllergyTerms } from '../mergeAllergyTerms';

describe('mergeAllergyTerms', () => {
    test('merges allergies and dietary restrictions', () => {
        const merged = mergeAllergyTerms(['peanut', 'milk'], ['vegan']);
        expect(merged).toEqual(['peanut', 'milk', 'vegan']);
    });

    test('returns empty array for empty inputs', () => {
        const emptyMerged = mergeAllergyTerms([], []);
        expect(emptyMerged).toEqual([]);
    });

    test('preserves current duplicate behavior', () => {
        const duplicateMerged = mergeAllergyTerms(['peanut'], ['peanut']);
        expect(duplicateMerged).toEqual(['peanut', 'peanut']);
    });
});
