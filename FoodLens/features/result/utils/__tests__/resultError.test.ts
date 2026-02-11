import { getResultErrorInfo, isResultError } from '../resultError';

describe('resultError', () => {
    it('detects known error food names', () => {
        expect(isResultError('Not Food')).toBe(true);
        expect(isResultError('Analysis Error')).toBe(true);
        expect(isResultError('Rice')).toBe(false);
    });

    it('returns busy server message for 429-like raw result', () => {
        const info = getResultErrorInfo('Analysis Error', '429 서버가 바쁩니다');
        expect(info.icon).toBe('time-outline');
        expect(info.title).toBe('잠시만 기다려주세요');
    });

    it('returns not-food message', () => {
        const info = getResultErrorInfo('Not Food', '');
        expect(info.icon).toBe('image-outline');
        expect(info.title).toBe('음식을 찾을 수 없어요');
    });

    it('falls back to generic error message', () => {
        const info = getResultErrorInfo('Error Analyzing Food', 'unknown');
        expect(info.icon).toBe('camera-outline');
        expect(info.title).toBe('분석을 못했어요');
    });
});
