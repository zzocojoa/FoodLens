import {
    AnalysisOrigin,
    AnalyzedData,
    DecisionConfidence,
    DecisionStatus,
    LatencyMsBreakdown,
    LatencyMsByStage,
    NutritionData,
    RecommendedAction,
    SafetyStatus,
    TranslationCard,
    UncertaintyReason,
} from './types';
import { getI18nSnapshot } from '@/features/i18n/services/i18nStore';

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

const parseSafetyStatus = (value: unknown, fallback: SafetyStatus): SafetyStatus => {
    if (value === 'SAFE' || value === 'CAUTION' || value === 'DANGER') {
        return value;
    }
    return fallback;
};

const parseDecisionStatus = (value: unknown): DecisionStatus | undefined => {
    if (value === 'OK' || value === 'ASK' || value === 'AVOID') {
        return value;
    }
    return undefined;
};

const parseAnalysisOrigin = (value: unknown): AnalysisOrigin | undefined => {
    if (
        value === 'food_photo' ||
        value === 'label_photo' ||
        value === 'barcode_lookup' ||
        value === 'barcode_to_label_fallback'
    ) {
        return value;
    }
    return undefined;
};

const parseRecommendedAction = (value: unknown): RecommendedAction | undefined => {
    if (value === 'eat' || value === 'verify_label' || value === 'ask_staff' || value === 'avoid') {
        return value;
    }
    return undefined;
};

const parseUncertaintyReason = (value: unknown): UncertaintyReason | undefined => {
    if (
        value === 'image_ambiguity' ||
        value === 'missing_label_text' ||
        value === 'barcode_not_found' ||
        value === 'low_confidence' ||
        value === 'unknown'
    ) {
        return value;
    }
    return undefined;
};

const parseDecisionConfidence = (value: unknown): DecisionConfidence | undefined => {
    if (value === 'high' || value === 'medium' || value === 'low') {
        return value;
    }
    return undefined;
};

const parseLatencyMsByStage = (value: unknown): LatencyMsByStage | undefined => {
    if (!isRecord(value)) return undefined;

    const entries = Object.entries(value).filter(([, itemValue]) => typeof itemValue === 'number');
    if (entries.length === 0) return undefined;

    return Object.fromEntries(entries) as LatencyMsByStage;
};

const parseLatencyMs = (value: unknown): LatencyMsBreakdown | undefined => {
    if (!isRecord(value)) return undefined;

    const entries = Object.entries(value).filter(([, itemValue]) => typeof itemValue === 'number');
    if (entries.length === 0) return undefined;

    return Object.fromEntries(entries) as LatencyMsBreakdown;
};

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
    const currentLocale =
        getI18nSnapshot().locale || Intl.DateTimeFormat().resolvedOptions().locale || 'en-US';
    if (currentLocale.toLowerCase().startsWith('ko')) {
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
        data['raw_result_en'],
        data['raw_result_ko'],
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
    const ingredients = Array.isArray(data['ingredients'])
        ? (data['ingredients'] as unknown[]).map((ing) => {
              if (!isRecord(ing)) return { name: 'Unknown', isAllergen: false };
              return {
                  name: getString(ing['name'], 'Unknown'),
                  name_en: getOptionalString(ing['name_en']),
                  name_ko: getOptionalString(ing['name_ko']),
                  isAllergen: ing['isAllergen'] === true,
                  confidence_score:
                      typeof ing['confidence_score'] === 'number' ? ing['confidence_score'] : undefined,
                  box_2d: Array.isArray(ing['box_2d']) ? (ing['box_2d'] as number[]) : undefined,
                  bbox: Array.isArray(ing['bbox']) ? (ing['bbox'] as number[]) : undefined,
                  nutrition: parseNutrition(ing['nutrition']),
              };
          })
        : [];
    const safetyStatus = parseSafetyStatus(data['safetyStatus'], 'CAUTION');
    const translationCard = parseTranslationCardFromPayload(data);

    return {
        foodName: getString(data['foodName'], 'Analyzed Food'),
        foodName_en: getOptionalString(data['foodName_en']),
        foodName_ko: getOptionalString(data['foodName_ko']),
        safetyStatus,
        decisionStatus: parseDecisionStatus(data['decision_status']),
        analysisOrigin: parseAnalysisOrigin(data['analysis_origin']),
        recommendedAction: parseRecommendedAction(data['recommended_action']),
        uncertaintyReason: parseUncertaintyReason(data['uncertainty_reason']),
        decisionConfidence: parseDecisionConfidence(data['decision_confidence']),
        confidence: clampConfidence(data['confidence']),
        request_id: getOptionalString(data['request_id']),
        prompt_version: getOptionalString(data['prompt_version']),
        used_model: getOptionalString(data['used_model']),
        latency_ms: parseLatencyMs(data['latency_ms']),
        latency_ms_by_stage: parseLatencyMsByStage(data['latency_ms_by_stage']),
        ingredients: ingredients as AnalyzedData['ingredients'],
        nutrition: parseNutrition(data['nutrition']),
        translationCard,
        raw_result: resolveSummaryText(data, translationCard),
        raw_result_en: getOptionalString(data['raw_result_en']),
        raw_result_ko: getOptionalString(data['raw_result_ko']),
        raw_data: data,
        fallback_reason: getOptionalString(data['fallback_reason']),
    };
};

export const mapBarcodeToAnalyzedData = (
    input: unknown,
    metadata: {
        requestId: string | undefined;
        promptVersion: string | undefined;
        usedModel: string | undefined;
        latencyMs: LatencyMsBreakdown | undefined;
        latencyMsByStage: LatencyMsByStage | undefined;
    }
): AnalyzedData => {
    const data = isRecord(input) ? input : {};
    const safetyStatus = parseSafetyStatus(data['safetyStatus'], 'SAFE');
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
                      name_en: getOptionalString(ing['name_en']),
                      name_ko: getOptionalString(ing['name_ko']),
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
        foodName_en: getOptionalString(data['food_name_en']),
        foodName_ko: getOptionalString(data['food_name_ko']),
        safetyStatus,
        decisionStatus: parseDecisionStatus(data['decision_status']),
        analysisOrigin: parseAnalysisOrigin(data['analysis_origin']) ?? 'barcode_lookup',
        recommendedAction: parseRecommendedAction(data['recommended_action']),
        uncertaintyReason: parseUncertaintyReason(data['uncertainty_reason']),
        decisionConfidence: parseDecisionConfidence(data['decision_confidence']),
        confidence: 100,
        ingredients,
        nutrition,
        raw_result: resolveSummaryText(data),
        raw_result_en: getOptionalString(data['raw_result_en']),
        raw_result_ko: getOptionalString(data['raw_result_ko']),
        request_id: metadata.requestId ?? getOptionalString(data['request_id']),
        prompt_version: metadata.promptVersion ?? getOptionalString(data['prompt_version']),
        used_model: metadata.usedModel ?? getOptionalString(data['used_model']),
        latency_ms: metadata.latencyMs ?? parseLatencyMs(data['latency_ms']),
        latency_ms_by_stage: metadata.latencyMsByStage ?? parseLatencyMsByStage(data['latency_ms_by_stage']),
        raw_data: data,
        fallback_reason: getOptionalString(data['fallback_reason']),
    };
};
