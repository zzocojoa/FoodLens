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
