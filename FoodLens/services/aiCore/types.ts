export interface NutritionData {
    calories: number | null;
    protein: number | null;
    carbs: number | null;
    fat: number | null;
    fiber: number | null;
    sodium: number | null;
    sugar: number | null;
    servingSize: string;
    dataSource: string;
    description?: string;
    fdcId?: number;
}

export interface TranslationCard {
    language: string;
    text: string | null;
    audio_query?: string;
}

export interface LatencyMsBreakdown {
    total?: number;
    preprocess?: number;
    extract?: number;
    assess?: number;
    source_lookup?: number;
    allergen_analysis?: number;
}

export type LatencyMsByStage = Record<string, number>;
export type SafetyStatus = 'SAFE' | 'CAUTION' | 'DANGER';
export type DecisionStatus = 'OK' | 'ASK' | 'AVOID';
export type AnalysisOrigin =
    | 'food_photo'
    | 'label_photo'
    | 'barcode_lookup'
    | 'barcode_to_label_fallback';
export type RecommendedAction = 'eat' | 'verify_label' | 'ask_staff' | 'avoid';
export type UncertaintyReason =
    | 'image_ambiguity'
    | 'missing_label_text'
    | 'barcode_not_found'
    | 'low_confidence'
    | 'unknown';
export type DecisionConfidence = 'high' | 'medium' | 'low';
export type FoodOrigin = 'korean' | 'western' | 'asian' | 'single_ingredient' | 'other' | 'unknown';

export interface AnalyzedData {
    foodName: string;
    foodName_en?: string;
    foodName_ko?: string;
    foodOrigin?: FoodOrigin;
    safetyStatus: SafetyStatus;
    decisionStatus?: DecisionStatus;
    analysisOrigin?: AnalysisOrigin;
    recommendedAction?: RecommendedAction;
    uncertaintyReason?: UncertaintyReason;
    decisionConfidence?: DecisionConfidence;
    confidence?: number;
    request_id?: string;
    prompt_version?: string;
    latency_ms?: LatencyMsBreakdown;
    latency_ms_by_stage?: LatencyMsByStage;
    ingredients: {
        name: string;
        name_en?: string;
        name_ko?: string;
        isAllergen: boolean;
        confidence_score?: number;
        box_2d?: number[];
        bbox?: number[];
        nutrition?: NutritionData;
    }[];
    nutrition?: NutritionData;
    translationCard?: TranslationCard;
    raw_result?: string;
    raw_result_en?: string;
    raw_result_ko?: string;
    raw_data?: Record<string, unknown>;
    used_model?: string;
    fallback_reason?: string;
    isBarcode?: boolean;
}

export type AnalysisJobMode = 'food' | 'label' | 'smart';

export type AnalysisJobStatus =
    | 'queued'
    | 'preprocessing'
    | 'inference'
    | 'nutrition'
    | 'finalizing'
    | 'completed'
    | 'fallback_completed'
    | 'failed';

export type PendingAnalysisJob = {
    jobId: string;
    requestId: string;
    flow: 'camera' | 'scan';
    mode: AnalysisJobMode;
    status: AnalysisJobStatus;
    imageUri: string;
    isoCountryCode: string;
    location: Record<string, unknown> | null;
    timestamp: string | null;
    sourceType: 'camera' | 'library';
    submittedAt: string;
};

export type BarcodeLookupResult = {
    found: boolean;
    data?: AnalyzedData;
    error?: string;
    request_id?: string;
    used_model?: string;
    prompt_version?: string;
    latency_ms?: LatencyMsBreakdown;
};
