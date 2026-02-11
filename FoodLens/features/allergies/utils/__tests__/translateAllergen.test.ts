/// <reference types="jest" />

import { translateAllergenToKorean } from '../translateAllergen';

const TEST_TERMS = {
    Peanuts: { KR: '땅콩' },
    Milk: { KR: '우유' },
} as const;

describe('translateAllergenToKorean', () => {
    test('translates exact key', () => {
        const exact = translateAllergenToKorean('Peanuts', TEST_TERMS);
        expect(exact).toBe('땅콩');
    });

    test('translates case-insensitive key', () => {
        const caseInsensitive = translateAllergenToKorean('milk', TEST_TERMS);
        expect(caseInsensitive).toBe('우유');
    });

    test('falls back to original term when missing', () => {
        const fallback = translateAllergenToKorean('UnknownTerm', TEST_TERMS);
        expect(fallback).toBe('UnknownTerm');
    });
});
