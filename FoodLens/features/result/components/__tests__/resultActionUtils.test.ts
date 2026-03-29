import {
    buildResultReportMailtoUrl,
    buildResultShareCardData,
    buildResultShareMessageData,
    buildResultShareMessage,
    isResultReportPendingSave,
} from '../resultActionUtils';
import type { ResultLocationData } from '@/components/result/resultContent/types';
import type { LoadedAnalysisData } from '@/hooks/result/analysisDataService';

const t = (key: string, fallback?: string): string => fallback ?? key;

const RESULT: NonNullable<LoadedAnalysisData['result']> = {
    foodName: 'Bibimbap',
    foodName_en: 'Bibimbap',
    foodName_ko: '비빔밥',
    safetyStatus: 'CAUTION',
    confidence: 88,
    request_id: 'req-123',
    prompt_version: 'food-v3.2',
    ingredients: [],
    raw_result: 'Test summary',
    raw_result_en: 'Test summary',
    raw_result_ko: '테스트 요약',
    used_model: 'gemini-2.5-pro',
    isBarcode: false,
};

const LOCATION: ResultLocationData = {
    city: 'Seoul',
    country: 'South Korea',
    formattedAddress: 'Seoul, South Korea',
    isoCountryCode: 'KR',
};

const RESULT_WITH_RECORD_ID = {
    ...RESULT,
    id: 'record-embedded-42',
} as NonNullable<LoadedAnalysisData['result']> & { id: string };

describe('resultActionUtils', () => {
    it('builds a share message with localized food and safety labels', () => {
        const message = buildResultShareMessage({
            result: RESULT,
            locationData: LOCATION,
            timestamp: '2026-03-29T10:15:00.000Z',
            locale: 'en-US',
            t,
        });

        expect(message).toContain('FoodLens analysis result');
        expect(message).toContain('Food: Bibimbap');
        expect(message).toContain('Safety: ASK');
        expect(message).toContain('Location: Seoul, South Korea');
        expect(message).toContain('Summary: Test summary');
        expect(message).toContain('See the attached image card for a quick summary.');
        expect(message).toContain('Shared from FoodLens');
    });

    it('builds share message data with title and body', () => {
        const shareMessageData = buildResultShareMessageData({
            result: RESULT,
            locationData: LOCATION,
            timestamp: '2026-03-29T10:15:00.000Z',
            locale: 'en-US',
            t,
        });

        expect(shareMessageData.title).toBe('FoodLens analysis result');
        expect(shareMessageData.message).toContain('Summary: Test summary');
    });

    it('builds share card data with concise reasons and action copy', () => {
        const cardData = buildResultShareCardData({
            result: {
                ...RESULT,
                ingredients: [
                    {
                        name: 'Peanut',
                        name_en: 'Peanut',
                        name_ko: '땅콩',
                        isAllergen: true,
                    },
                ],
            },
            locationData: LOCATION,
            timestamp: '2026-03-29T10:15:00.000Z',
            locale: 'en-US',
            t,
        });

        expect(cardData.foodName).toBe('Bibimbap');
        expect(cardData.safetyLabel).toBe('Use Caution');
        expect(cardData.reasons[0]).toContain('Potential allergens: Peanut');
        expect(cardData.actionLine).toBe('Confirm with staff or packaging before eating.');
        expect(cardData.locationLabel).toBe('Seoul, South Korea');
        expect(cardData.themeVariant).toBe('caution');
    });

    it('builds a mailto url with report metadata', () => {
        const url = buildResultReportMailtoUrl({
            result: RESULT,
            locationData: LOCATION,
            timestamp: '2026-03-29T10:15:00.000Z',
            locale: 'en-US',
            savedRecordId: 'record-99',
            t,
        });

        const decoded = decodeURIComponent(url);
        expect(decoded).toContain('mailto:support@foodlens.com');
        expect(decoded).toContain('Incorrect result report');
        expect(decoded).toContain('I want to report an incorrect analysis result.');
        expect(decoded).toContain('Request ID: req-123');
        expect(decoded).toContain('History record: record-99');
        expect(decoded).toContain('Model: gemini-2.5-pro');
        expect(decoded).toContain('Prompt version: food-v3.2');
    });

    it('falls back to embedded result id when savedRecordId is not set', () => {
        const url = buildResultReportMailtoUrl({
            result: RESULT_WITH_RECORD_ID,
            locationData: LOCATION,
            timestamp: '2026-03-29T10:15:00.000Z',
            locale: 'en-US',
            savedRecordId: null,
            t,
        });

        const decoded = decodeURIComponent(url);
        expect(decoded).toContain('History record: record-embedded-42');
    });

    it('marks only unsaved new results as pending', () => {
        expect(isResultReportPendingSave(true, null)).toBe(true);
        expect(isResultReportPendingSave(true, 'record-99')).toBe(false);
        expect(isResultReportPendingSave(false, null)).toBe(false);
    });
});
