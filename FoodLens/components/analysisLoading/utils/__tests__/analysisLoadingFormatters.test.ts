import { getMainMessage, getProgressWidth } from '../analysisLoadingFormatters';

describe('analysisLoadingFormatters', () => {
    it('returns error message when error state', () => {
        expect(getMainMessage(true, false, 0)).toBe('ANALYSIS FAILED');
    });

    it('returns warmup message on long wait at AI step', () => {
        expect(getMainMessage(false, true, 2)).toBe('SERVER WARMING UP...');
    });

    it('calculates automatic progress by step', () => {
        expect(getProgressWidth(false, false, 0)).toBe('25%');
        expect(getProgressWidth(false, false, 3)).toBe('100%');
    });

    it('calculates manual upload progress with cap', () => {
        expect(getProgressWidth(false, true, 1, 0.5)).toBe('50%');
        expect(getProgressWidth(false, true, 1, 1)).toBe('75%');
    });
});
