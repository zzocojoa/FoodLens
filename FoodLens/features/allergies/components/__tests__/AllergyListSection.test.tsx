/// <reference types="jest" />

import React from 'react';
import { render } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import AllergyListSection from '../AllergyListSection';
import { Colors } from '../../../../constants/theme';

jest.mock('../../constants/allergies.constants', () => ({
    ALLERGIES_COPY: {
        emptyTitle: { key: 'allergies.empty.title', fallback: 'All Clear!' },
        emptyDescription: { key: 'allergies.empty.description', fallback: '등록된 알레르기 정보가 없습니다.' },
    },
}));

jest.mock('@/features/i18n', () => {
    const en = jest.requireActual('../../../i18n/resources/en.json') as Record<string, string>;

    const requiresResource = (key: string): boolean =>
        key.startsWith('allergies.') || key.startsWith('onboarding.severity.');

    return {
        useI18n: () => ({
            t: (key: string, fallback?: string) => {
                const value = en[key];
                if (typeof value === 'string') return value;
                if (requiresResource(key)) {
                    throw new Error(`Missing test i18n resource: ${key}`);
                }
                return fallback ?? key;
            },
        }),
    };
});

describe('AllergyListSection', () => {
    const theme = Colors.light;

    test('renders loading indicator while loading', () => {
        const { UNSAFE_getByType } = render(
            <AllergyListSection
                loading={true}
                allergies={[]}
                dietaryRestrictions={[]}
                severityMap={{}}
                theme={theme}
                onPressEdit={() => undefined}
            />
        );

        expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    });

    test('renders empty state when allergies are not registered', () => {
        const { getByText } = render(
            <AllergyListSection
                loading={false}
                allergies={[]}
                dietaryRestrictions={[]}
                severityMap={{}}
                theme={theme}
                onPressEdit={() => undefined}
            />
        );

        expect(getByText('All Clear!')).toBeTruthy();
        expect(getByText('No allergy information registered.')).toBeTruthy();
        expect(getByText('Add allergy info')).toBeTruthy();
    });

    test('renders split sections and severity labels', () => {
        const { getAllByText, getByText } = render(
            <AllergyListSection
                loading={false}
                allergies={['Peanuts', 'Milk']}
                dietaryRestrictions={['Vegan']}
                severityMap={{ Peanuts: 'severe', Milk: 'mild', Vegan: 'moderate' }}
                theme={theme}
                onPressEdit={() => undefined}
            />
        );

        expect(getByText('Allergies')).toBeTruthy();
        expect(getByText('Other Restrictions')).toBeTruthy();
        expect(getByText('땅콩')).toBeTruthy();
        expect(getByText('우유')).toBeTruthy();
        expect(getByText('Peanuts')).toBeTruthy();
        expect(getByText('Milk')).toBeTruthy();
        expect(getAllByText('Vegan')).toHaveLength(2);
        expect(getByText('Severe')).toBeTruthy();
        expect(getByText('Mild')).toBeTruthy();
        expect(getByText('Moderate')).toBeTruthy();
    });

    test('renders canonical and custom restriction display labels without storage prefixes', () => {
        const { getAllByText, getByText, queryByText } = render(
            <AllergyListSection
                loading={false}
                allergies={['peanut']}
                dietaryRestrictions={['gluten_free', 'custom:no raw onion']}
                severityMap={{ peanut: 'moderate' }}
                theme={theme}
                onPressEdit={() => undefined}
            />
        );

        expect(getAllByText('Peanut')).toHaveLength(2);
        expect(getAllByText('Gluten Free')).toHaveLength(2);
        expect(getAllByText('no raw onion')).toHaveLength(2);
        expect(queryByText('custom:no raw onion')).toBeNull();
    });
});
