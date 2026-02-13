import { clampConfidence, mapAnalyzedData, mapBarcodeToAnalyzedData } from '../mappers';

describe('aiCore mappers', () => {
    it('clamps confidence values', () => {
        expect(clampConfidence(120)).toBe(100);
        expect(clampConfidence(-2)).toBe(0);
        expect(clampConfidence(42)).toBe(42);
        expect(clampConfidence('bad')).toBeUndefined();
    });

    it('maps analyze data defaults', () => {
        const mapped = mapAnalyzedData({});
        expect(mapped.foodName).toBe('Analyzed Food');
        expect(mapped.safetyStatus).toBe('CAUTION');
        expect(mapped.ingredients).toEqual([]);
        expect(typeof mapped.raw_result).toBe('string');
    });

    it('falls back summary to alternative payload fields', () => {
        const mapped = mapAnalyzedData({
            foodName: 'Soup',
            safetyStatus: 'SAFE',
            summary: 'Localized summary text',
        });
        expect(mapped.raw_result).toBe('Localized summary text');
    });

    it('falls back summary to translation text when summary is missing', () => {
        const mapped = mapAnalyzedData({
            foodName: 'Soup',
            safetyStatus: 'SAFE',
            translation_card: {
                language: 'ko-KR',
                text: '요약 번역',
            },
        });
        expect(mapped.raw_result).toBe('요약 번역');
        expect(mapped.translationCard?.text).toBe('요약 번역');
    });

    it('parses translation card from alternate keys', () => {
        const mapped = mapAnalyzedData({
            ai_translation: {
                locale: 'en-US',
                message: 'Translated card text',
            },
        });

        expect(mapped.translationCard).toEqual({
            language: 'en-US',
            text: 'Translated card text',
            audio_query: undefined,
        });
    });

    it('maps barcode payload to analyzed data', () => {
        const mapped = mapBarcodeToAnalyzedData({
            food_name: 'Noodles',
            safetyStatus: 'SAFE',
            calories: 200,
            protein: 10,
            carbs: 20,
            fat: 5,
            ingredients: ['wheat', { name: 'soy', isAllergen: true }],
            source: 'Barcode',
            servingSize: '100g',
        });

        expect(mapped.foodName).toBe('Noodles');
        expect(mapped.ingredients).toHaveLength(2);
        expect(mapped.ingredients[1].isAllergen).toBe(true);
        expect(mapped.nutrition?.calories).toBe(200);
    });
});
