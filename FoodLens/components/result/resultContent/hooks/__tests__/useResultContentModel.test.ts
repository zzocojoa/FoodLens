import { renderHook } from '@testing-library/react-native';
import { useResultContentModel } from '../useResultContentModel';

jest.mock('@/hooks/use-color-scheme', () => ({
    useColorScheme: () => 'light',
}));

const t = (_key: string, fallback?: string): string => fallback ?? _key;

describe('useResultContentModel', () => {
    it('prefers server-provided decision metadata when present', () => {
        const { result } = renderHook(() =>
            useResultContentModel(
                {
                    foodName: 'Bibimbap',
                    safetyStatus: 'CAUTION',
                    decisionStatus: 'ASK',
                    recommendedAction: 'verify_label',
                    ingredients: [],
                    raw_result: 'Contains sauce and mixed ingredients.',
                },
                null,
                '2026-04-10T12:00:00.000Z',
                t,
                'en-US'
            )
        );

        expect(result.current.safetyLabel).toBe('ASK');
        expect(result.current.actionLabel).toBe('Check the label before eating.');
        expect(result.current.decisionVariant).toBe('ask');
        expect(result.current.decisionChecklistItems).toEqual([
            'Use your traveler card if you need to confirm with staff.',
        ]);
    });

    it('falls back to safetyStatus-based action text when recommendedAction is missing', () => {
        const { result } = renderHook(() =>
            useResultContentModel(
                {
                    foodName: 'Bibimbap',
                    safetyStatus: 'DANGER',
                    ingredients: [],
                },
                null,
                '2026-04-10T12:00:00.000Z',
                t,
                'en-US'
            )
        );

        expect(result.current.safetyLabel).toBe('AVOID');
        expect(result.current.actionLabel).toBe('Avoid eating until ingredients are confirmed.');
        expect(result.current.decisionVariant).toBe('avoid');
    });

    it('keeps the checklist focused on the next action when allergens are detected', () => {
        const { result } = renderHook(() =>
            useResultContentModel(
                {
                    foodName: 'Bibimbap',
                    safetyStatus: 'DANGER',
                    ingredients: [
                        {
                            name: 'Wheat flour',
                            isAllergen: true,
                        },
                    ],
                },
                null,
                '2026-04-10T12:00:00.000Z',
                t,
                'en-US'
            )
        );

        expect(result.current.decisionChecklistItems).toEqual([
            'Use your traveler card before ordering or eating.',
        ]);
    });
});
