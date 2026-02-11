import { AnalyzedData, NutritionData } from './types';

export const clampConfidence = (confidence: unknown) =>
    typeof confidence === 'number' ? Math.max(0, Math.min(100, confidence)) : undefined;

export const mapAnalyzedData = (data: any): AnalyzedData => ({
    foodName: data.foodName || 'Analyzed Food',
    safetyStatus: data.safetyStatus || 'CAUTION',
    confidence: clampConfidence(data.confidence),
    ingredients: data.ingredients || [],
    nutrition: data.nutrition || undefined,
    translationCard: data.translationCard,
    raw_result: data.raw_result,
});

export const mapBarcodeToAnalyzedData = (data: any): AnalyzedData => {
    const nutrition: NutritionData | undefined = {
        calories: data.calories || null,
        protein: data.protein || null,
        carbs: data.carbs || null,
        fat: data.fat || null,
        fiber: data.fiber || null,
        sodium: data.sodium || null,
        sugar: data.sugar || null,
        servingSize: data.servingSize || '100g',
        dataSource: data.source || 'Barcode',
        description: data.food_name,
    };

    const ingredients = Array.isArray(data.ingredients)
        ? data.ingredients.map((ing: any) => {
              if (typeof ing === 'object' && ing !== null) {
                  return {
                      name: ing.name || 'Unknown',
                      isAllergen: ing.isAllergen || false,
                      riskReason: ing.riskReason || '',
                  };
              }
              return {
                  name: ing,
                  isAllergen: false,
              };
          })
        : [];

    return {
        foodName: data.food_name || 'Unknown Product',
        safetyStatus: data.safetyStatus || 'SAFE',
        confidence: 100,
        ingredients,
        nutrition,
        raw_result: data.coachMessage || '등록된 알러지 성분이 감지되지 않았습니다. 안심하고 드세요.',
        raw_data: data,
    };
};
