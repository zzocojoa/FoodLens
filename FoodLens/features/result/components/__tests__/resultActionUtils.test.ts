import { buildResultReportMailtoUrl, buildResultShareMessage } from '../resultActionUtils';
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
        expect(message).toContain('Shared from FoodLens');
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
});
