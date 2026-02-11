import { buildBreakdownViewModel } from '../breakdownData';

describe('buildBreakdownViewModel', () => {
    it('calculates macro percentages and flags', () => {
        const model = buildBreakdownViewModel({
            foodName: 'Test',
            safetyStatus: 'SAFE',
            ingredients: [{ name: 'egg', isAllergen: true }],
            nutrition: {
                calories: 200,
                protein: 10,
                carbs: 20,
                fat: 10,
                fiber: null,
                sodium: null,
                sugar: null,
                servingSize: '100g',
                dataSource: 'db',
            },
        });

        expect(model.hasNutrition).toBe(true);
        expect(model.hasAllergens).toBe(true);
        expect(model.proteinPercent).toBe(25);
        expect(model.carbsPercent).toBe(50);
        expect(model.fatPercent).toBe(25);
    });

    it('handles missing nutrition safely', () => {
        const model = buildBreakdownViewModel({
            foodName: 'Test',
            safetyStatus: 'SAFE',
            ingredients: [{ name: 'rice', isAllergen: false }],
        });

        expect(model.hasNutrition).toBe(false);
        expect(model.calories).toBe(0);
        expect(model.macroRows[0].value).toBe('0.0');
    });
});
