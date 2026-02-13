import { AnalyzedData, NutritionData, TranslationCard } from './types';

export const clampConfidence = (confidence: unknown) =>
    typeof confidence === 'number' ? Math.max(0, Math.min(100, confidence)) : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const getString = (value: unknown, fallback = ''): string =>
    typeof value === 'string' && value.length > 0 ? value : fallback;

const getNumberOrNull = (value: unknown): number | null =>
    typeof value === 'number' ? value : null;

const parseNutrition = (value: unknown): NutritionData | undefined => {
    if (!isRecord(value)) return undefined;

    return {
        calories: getNumberOrNull(value['calories']),
        protein: getNumberOrNull(value['protein']),
        carbs: getNumberOrNull(value['carbs']),
        fat: getNumberOrNull(value['fat']),
        fiber: getNumberOrNull(value['fiber']),
        sodium: getNumberOrNull(value['sodium']),
        sugar: getNumberOrNull(value['sugar']),
        servingSize: getString(value['servingSize'], '100g'),
        dataSource: getString(value['dataSource'], 'AI'),
        description: typeof value['description'] === 'string' ? value['description'] : undefined,
        fdcId: typeof value['fdcId'] === 'number' ? value['fdcId'] : undefined,
    };
};

const parseTranslationCard = (value: unknown): TranslationCard | undefined => {
    if (!isRecord(value)) return undefined;
    if (typeof value['language'] !== 'string') return undefined;

    return {
        language: value['language'],
        text: typeof value['text'] === 'string' || value['text'] === null ? value['text'] : null,
        audio_query: typeof value['audio_query'] === 'string' ? value['audio_query'] : undefined,
    };
};

export const mapAnalyzedData = (input: unknown): AnalyzedData => {
    const data = isRecord(input) ? input : {};
    const ingredients = Array.isArray(data['ingredients']) ? data['ingredients'] : [];
    const safetyStatus = data['safetyStatus'];

    return {
        foodName: getString(data['foodName'], 'Analyzed Food'),
        safetyStatus:
            safetyStatus === 'SAFE' || safetyStatus === 'CAUTION' || safetyStatus === 'DANGER'
                ? safetyStatus
                : 'CAUTION',
        confidence: clampConfidence(data['confidence']),
        ingredients: ingredients as AnalyzedData['ingredients'],
        nutrition: parseNutrition(data['nutrition']),
        translationCard: parseTranslationCard(data['translationCard']),
        raw_result: typeof data['raw_result'] === 'string' ? data['raw_result'] : undefined,
    };
};

export const mapBarcodeToAnalyzedData = (input: unknown): AnalyzedData => {
    const data = isRecord(input) ? input : {};
    const nutrition: NutritionData | undefined = {
        calories: getNumberOrNull(data['calories']),
        protein: getNumberOrNull(data['protein']),
        carbs: getNumberOrNull(data['carbs']),
        fat: getNumberOrNull(data['fat']),
        fiber: getNumberOrNull(data['fiber']),
        sodium: getNumberOrNull(data['sodium']),
        sugar: getNumberOrNull(data['sugar']),
        servingSize: getString(data['servingSize'], '100g'),
        dataSource: getString(data['source'], 'Barcode'),
        description: typeof data['food_name'] === 'string' ? data['food_name'] : undefined,
    };

    const ingredients = Array.isArray(data['ingredients'])
        ? (data['ingredients'] as unknown[]).map((ing) => {
              if (isRecord(ing)) {
                  return {
                      name: getString(ing['name'], 'Unknown'),
                      isAllergen: ing['isAllergen'] === true,
                      riskReason: getString(ing['riskReason']),
                  };
              }
              return {
                  name: typeof ing === 'string' && ing.length > 0 ? ing : 'Unknown',
                  isAllergen: false,
              };
          })
        : [];

    return {
        foodName: getString(data['food_name'], 'Unknown Product'),
        safetyStatus:
            data['safetyStatus'] === 'SAFE' || data['safetyStatus'] === 'CAUTION' || data['safetyStatus'] === 'DANGER'
                ? data['safetyStatus']
                : 'SAFE',
        confidence: 100,
        ingredients,
        nutrition,
        raw_result:
            typeof data['coachMessage'] === 'string'
                ? data['coachMessage']
                : '등록된 알러지 성분이 감지되지 않았습니다. 안심하고 드세요.',
        raw_data: data,
    };
};
