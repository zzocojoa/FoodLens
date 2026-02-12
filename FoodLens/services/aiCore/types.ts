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

export interface AnalyzedData {
    foodName: string;
    safetyStatus: 'SAFE' | 'CAUTION' | 'DANGER';
    confidence?: number;
    ingredients: {
        name: string;
        isAllergen: boolean;
        confidence_score?: number;
        box_2d?: number[];
        bbox?: number[];
        nutrition?: NutritionData;
    }[];
    nutrition?: NutritionData;
    translationCard?: TranslationCard;
    raw_result?: string;
    raw_data?: any;
    used_model?: string;
    isBarcode?: boolean;
}

export type BarcodeLookupResult = {
    found: boolean;
    data?: AnalyzedData;
    error?: string;
};
