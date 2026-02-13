import { AnalyzedData, NutritionData, TranslationCard } from './types';

export const clampConfidence = (confidence: unknown) =>
    typeof confidence === 'number' ? Math.max(0, Math.min(100, confidence)) : undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null;

const getString = (value: unknown, fallback = ''): string =>
    typeof value === 'string' && value.length > 0 ? value : fallback;

const getOptionalString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value : undefined;

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
    const language =
        getOptionalString(value['language']) ??
        getOptionalString(value['locale']) ??
        getOptionalString(value['lang']) ??
        getOptionalString(value['targetLanguage']) ??
        'unknown';
    const text =
        getOptionalString(value['text']) ??
        getOptionalString(value['message']) ??
        getOptionalString(value['translated_text']) ??
        null;

    return {
        language,
        text,
        audio_query: typeof value['audio_query'] === 'string' ? value['audio_query'] : undefined,
    };
};

const getDefaultSummaryByLocale = (): string => {
    const deviceLocale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    if (deviceLocale.startsWith('ko')) {
        return '분석 요약이 제공되지 않았습니다. 성분 정보를 확인해 주세요.';
    }
    return 'No analysis summary was returned. Please review the ingredient details.';
};

const parseTranslationCardFromPayload = (data: Record<string, unknown>): TranslationCard | undefined => {
    const direct =
        parseTranslationCard(data['translationCard']) ??
        parseTranslationCard(data['translation_card']) ??
        parseTranslationCard(data['aiTranslation']) ??
        parseTranslationCard(data['ai_translation']);

    if (direct) return direct;

    const fallbackText =
        getOptionalString(data['translated_text']) ??
        getOptionalString(data['translation_text']) ??
        getOptionalString(data['localized_text']);

    if (!fallbackText) return undefined;

    return {
        language:
            getOptionalString(data['translation_language']) ??
            getOptionalString(data['target_language']) ??
            'unknown',
        text: fallbackText,
    };
};

const resolveSummaryText = (data: Record<string, unknown>, translationCard?: TranslationCard): string => {
    const candidates = [
        data['raw_result'],
        data['coachMessage'],
        data['summary'],
        data['result_text'],
        data['analysis_text'],
        data['message'],
        data['localized_summary'],
        data['localized_text'],
    ];

    for (const candidate of candidates) {
        const text = getOptionalString(candidate);
        if (text) return text;
    }

    if (translationCard?.text) return translationCard.text;
    return getDefaultSummaryByLocale();
};

export const mapAnalyzedData = (input: unknown): AnalyzedData => {
    const data = isRecord(input) ? input : {};
    const ingredients = Array.isArray(data['ingredients']) ? data['ingredients'] : [];
    const safetyStatus = data['safetyStatus'];
    const translationCard = parseTranslationCardFromPayload(data);

    return {
        foodName: getString(data['foodName'], 'Analyzed Food'),
        safetyStatus:
            safetyStatus === 'SAFE' || safetyStatus === 'CAUTION' || safetyStatus === 'DANGER'
                ? safetyStatus
                : 'CAUTION',
        confidence: clampConfidence(data['confidence']),
        ingredients: ingredients as AnalyzedData['ingredients'],
        nutrition: parseNutrition(data['nutrition']),
        translationCard,
        raw_result: resolveSummaryText(data, translationCard),
        raw_data: data,
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
        raw_result: resolveSummaryText(data),
        raw_data: data,
    };
};
