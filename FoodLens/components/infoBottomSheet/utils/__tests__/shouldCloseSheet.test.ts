import { shouldCloseSheet } from '../shouldCloseSheet';

describe('shouldCloseSheet', () => {
    it('closes when dragged far enough', () => {
        expect(shouldCloseSheet(120, 100)).toBe(true);
    });

    it('closes when velocity is high enough', () => {
        expect(shouldCloseSheet(50, 700)).toBe(true);
    });

    it('does not close for short/slow drag', () => {
        expect(shouldCloseSheet(50, 100)).toBe(false);
    });
});
