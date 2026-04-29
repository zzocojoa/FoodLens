import React from 'react';
import { StyleSheet, View } from 'react-native';
import { render } from '@testing-library/react-native';

import { Colors } from '@/constants/theme';
import AiSummaryCard from '../AiSummaryCard';

const t = (_key: string, fallback?: string): string => fallback ?? _key;

describe('AiSummaryCard', () => {
    it('uses visible dark theme colors for title and summary text', () => {
        const view = render(
            <AiSummaryCard
                colorScheme="dark"
                theme={Colors.dark}
                summary="Detected ingredients need review."
                t={t}
            />
        );

        expect(StyleSheet.flatten(view.getByText('Why this result').props.style)).toMatchObject({
            color: Colors.dark.primary,
        });
        const card = view.UNSAFE_getAllByType(View).find((node) => {
            const flatStyle = StyleSheet.flatten(node.props.style);

            return flatStyle?.backgroundColor === Colors.dark.surface;
        });

        expect(card).toBeDefined();
        expect(StyleSheet.flatten(card?.props.style)).toMatchObject({
            backgroundColor: Colors.dark.surface,
            borderColor: Colors.dark.border,
        });
        expect(StyleSheet.flatten(card?.props.style)).not.toHaveProperty('iconColor');
        expect(StyleSheet.flatten(view.getByText('Detected ingredients need review.').props.style)).toMatchObject({
            color: Colors.dark.textPrimary,
        });
    });

    it('uses the localized fallback when the summary is blank', () => {
        const localizedT = (key: string, fallback?: string): string => {
            if (key === 'result.ai.defaultSummary') {
                return 'This result is based on the detected ingredients and context.';
            }

            return fallback ?? key;
        };

        const view = render(
            <AiSummaryCard
                colorScheme="light"
                theme={Colors.light}
                summary="   "
                t={localizedT}
            />
        );

        expect(view.getByText('This result is based on the detected ingredients and context.')).toBeTruthy();
    });
});
