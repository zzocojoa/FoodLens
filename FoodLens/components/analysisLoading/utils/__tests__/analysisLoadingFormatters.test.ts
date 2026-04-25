import { getMainMessage, getProgressWidth } from '../analysisLoadingFormatters';

describe('analysisLoadingFormatters', () => {
    it('returns error message when error state', () => {
        expect(getMainMessage(true, false, 0)).toBe('ANALYSIS FAILED');
    });

    it('returns long wait message at AI inference step', () => {
        expect(getMainMessage(false, true, 4)).toBe('ANALYSIS IS TAKING LONGER THAN USUAL...');
    });

    it('calculates automatic progress by step', () => {
        expect(getProgressWidth(false, false, 0)).toBe('14.285714285714285%');
        expect(getProgressWidth(false, false, 6)).toBe('100%');
    });

    it('calculates manual upload progress with cap', () => {
        expect(getProgressWidth(false, true, 1, 0.5)).toBe('25%');
        expect(getProgressWidth(false, true, 1, 1)).toBe('36%');
    });
});
