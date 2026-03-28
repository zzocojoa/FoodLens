import { clampConfidence, mapAnalyzedData, mapBarcodeToAnalyzedData } from '../mappers';

const mockGetI18nSnapshot = jest.fn(() => ({
    settings: { language: 'auto', targetLanguage: null },
    locale: 'en-US',
    ready: true,
}));

jest.mock('@/features/i18n/services/i18nStore', () => ({
    getI18nSnapshot: () => mockGetI18nSnapshot(),
}));

describe('aiCore mappers', () => {
    beforeEach(() => {
        mockGetI18nSnapshot.mockReturnValue({
            settings: { language: 'auto', targetLanguage: null },
            locale: 'en-US',
            ready: true,
        });
    });

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

    it('preserves observability metadata from analyze payloads', () => {
        const mapped = mapAnalyzedData({
            foodName: 'Soup',
            safetyStatus: 'SAFE',
            ingredients: [],
            request_id: 'req-1',
            prompt_version: 'food-v3.2-context-engineered',
            used_model: 'gemini-2.5-pro',
            latency_ms: { total: 1234, preprocess: 100 },
            latency_ms_by_stage: { inference: 1200 },
        });

        expect(mapped.request_id).toBe('req-1');
        expect(mapped.prompt_version).toBe('food-v3.2-context-engineered');
        expect(mapped.used_model).toBe('gemini-2.5-pro');
        expect(mapped.latency_ms).toEqual({ total: 1234, preprocess: 100 });
        expect(mapped.latency_ms_by_stage).toEqual({ inference: 1200 });
    });

    it('uses i18n locale for default summary fallback', () => {
        mockGetI18nSnapshot.mockReturnValue({
            settings: { language: 'auto', targetLanguage: null },
            locale: 'ko-KR',
            ready: true,
        });
        const mapped = mapAnalyzedData({});
        expect(mapped.raw_result).toContain('분석 요약');
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
            request_id: 'req-barcode-1',
            prompt_version: 'label-v1.2-2pass-locale-country',
            used_model: 'gemini-2.5-pro',
            latency_ms: { total: 345, source_lookup: 120 },
            latency_ms_by_stage: { total: 345 },
            fallback_reason: 'barcode_fallback',
        }, {
            requestId: 'req-barcode-1',
            promptVersion: undefined,
            usedModel: undefined,
            latencyMs: undefined,
            latencyMsByStage: undefined,
        });

        expect(mapped.foodName).toBe('Noodles');
        expect(mapped.ingredients).toHaveLength(2);
        expect(mapped.ingredients[1].isAllergen).toBe(true);
        expect(mapped.nutrition?.calories).toBe(200);
        expect(mapped.request_id).toBe('req-barcode-1');
        expect(mapped.prompt_version).toBe('label-v1.2-2pass-locale-country');
        expect(mapped.used_model).toBe('gemini-2.5-pro');
        expect(mapped.latency_ms).toEqual({ total: 345, source_lookup: 120 });
        expect(mapped.latency_ms_by_stage).toEqual({ total: 345 });
        expect(mapped.fallback_reason).toBe('barcode_fallback');
    });

    it('prefers top-level barcode observability metadata when payload data does not include it', () => {
        const mapped = mapBarcodeToAnalyzedData({
            food_name: 'Noodles',
            safetyStatus: 'SAFE',
            ingredients: [],
        }, {
            requestId: 'req-barcode-top-level',
            promptVersion: 'barcode-v1.0-allergen-analysis',
            usedModel: 'gemini-2.0-flash',
            latencyMs: { total: 120, source_lookup: 40 },
            latencyMsByStage: { total: 120 },
        });

        expect(mapped.request_id).toBe('req-barcode-top-level');
        expect(mapped.prompt_version).toBe('barcode-v1.0-allergen-analysis');
        expect(mapped.used_model).toBe('gemini-2.0-flash');
        expect(mapped.latency_ms).toEqual({ total: 120, source_lookup: 40 });
        expect(mapped.latency_ms_by_stage).toEqual({ total: 120 });
    });
});
