import React from 'react';
import { render } from '@testing-library/react-native';
import { ResultContent } from '../ResultContent';

type RenderedTextNode =
    | string
    | number
    | {
          children: RenderedTextNode[];
      }
    | RenderedTextNode[];

jest.mock('@/hooks/use-color-scheme', () => ({
    useColorScheme: () => 'light',
}));

jest.mock('../../TravelerAllergyCard', () => {
    const ReactNative = jest.requireActual('react-native');

    return function MockTravelerAllergyCard() {
        return <ReactNative.Text>TRAVELER_CARD</ReactNative.Text>;
    };
});

jest.mock('../resultContent/components/AllergyAlertCard', () => {
    const ReactNative = jest.requireActual('react-native');

    return function MockAllergyAlertCard() {
        return <ReactNative.Text>ALLERGY_ALERT</ReactNative.Text>;
    };
});

jest.mock('../resultContent/components/AiSummaryCard', () => {
    const ReactNative = jest.requireActual('react-native');

    return function MockAiSummaryCard() {
        return <ReactNative.Text>SUMMARY_CARD</ReactNative.Text>;
    };
});

jest.mock('../resultContent/components/ResultContentFiller', () => {
    return function MockResultContentFiller() {
        return null;
    };
});

jest.mock('../resultContent/components/ResultIngredientsSection', () => {
    const ReactNative = jest.requireActual('react-native');

    return function MockResultIngredientsSection() {
        return <ReactNative.Text>INGREDIENTS_SECTION</ReactNative.Text>;
    };
});

const t = (_key: string, fallback?: string): string => fallback ?? _key;

const collectRenderedText = (node: RenderedTextNode | null): string[] => {
    if (node === null) {
        return [];
    }

    if (typeof node === 'string') {
        return [node];
    }

    if (typeof node === 'number') {
        return [String(node)];
    }

    if (Array.isArray(node)) {
        return node.flatMap((childNode) => collectRenderedText(childNode));
    }

    return collectRenderedText(node.children);
};

describe('ResultContent', () => {
    it('renders safety, action, reason, food name, and ingredients in that order', () => {
        const view = render(
            <ResultContent
                result={{
                    foodName: 'Bibimbap',
                    safetyStatus: 'CAUTION',
                    ingredients: [],
                    raw_result: 'Contains sauce and mixed ingredients.',
                }}
                locationData={null}
                imageSource={null}
                timestamp={null}
                onOpenBreakdown={jest.fn()}
                onDatePress={jest.fn()}
                t={t}
                locale="en-US"
            />
        );

        const renderedText = collectRenderedText(view.toJSON());
        const safetyIndex = renderedText.indexOf('ASK');
        const actionIndex = renderedText.indexOf('Check the label or ask staff before eating.');
        const breakdownIndex = renderedText.indexOf('Why this result');
        const reasonIndex = renderedText.indexOf('SUMMARY_CARD');
        const foodNameIndex = renderedText.indexOf('Bibimbap');
        const travelerCardIndex = renderedText.indexOf('TRAVELER_CARD');
        const ingredientsIndex = renderedText.indexOf('INGREDIENTS_SECTION');

        expect(safetyIndex).toBeGreaterThanOrEqual(0);
        expect(actionIndex).toBeGreaterThan(safetyIndex);
        expect(breakdownIndex).toBeGreaterThan(actionIndex);
        expect(reasonIndex).toBeGreaterThan(actionIndex);
        expect(foodNameIndex).toBeGreaterThan(reasonIndex);
        expect(travelerCardIndex).toBeGreaterThan(foodNameIndex);
        expect(ingredientsIndex).toBeGreaterThan(travelerCardIndex);
    });

    it('does not render the reason block when no summary is available', () => {
        const view = render(
            <ResultContent
                result={{
                    foodName: 'Bibimbap',
                    safetyStatus: 'SAFE',
                    ingredients: [],
                }}
                locationData={null}
                imageSource={null}
                timestamp={null}
                onOpenBreakdown={jest.fn()}
                onDatePress={jest.fn()}
                t={t}
                locale="en-US"
            />
        );

        const renderedText = collectRenderedText(view.toJSON());

        expect(renderedText).not.toContain('SUMMARY_CARD');
    });
});
