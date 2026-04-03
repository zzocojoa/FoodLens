/// <reference types="jest" />

import React from 'react';
import { render } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import AllergyListSection from '../AllergyListSection';
import { Colors } from '../../../../constants/theme';

jest.mock('../../constants/allergies.constants', () => ({
    ALLERGIES_COPY: {
        errorTitle: { key: 'allergies.error.title', fallback: 'Unable to load allergy info' },
        errorDescription: {
            key: 'allergies.error.description',
            fallback: 'We could not load your allergy information. Please try again.',
        },
        emptyTitle: { key: 'allergies.empty.title', fallback: 'All Clear!' },
        emptyDescription: { key: 'allergies.empty.description', fallback: '등록된 알레르기 정보가 없습니다.' },
    },
}));

jest.mock('@/features/i18n', () => ({
    useI18n: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

describe('AllergyListSection', () => {
    const theme = Colors.light;

    test('renders loading indicator while loading', () => {
        const { UNSAFE_getByType } = render(
            <AllergyListSection
                loading={true}
                loadError={false}
                allergies={[]}
                dietaryRestrictions={[]}
                severityMap={{}}
                theme={theme}
                onPressEdit={() => undefined}
                onPressRetry={() => undefined}
            />
        );

        expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    });

    test('renders empty state when allergies are not registered', () => {
        const { getByText } = render(
            <AllergyListSection
                loading={false}
                loadError={false}
                allergies={[]}
                dietaryRestrictions={[]}
                severityMap={{}}
                theme={theme}
                onPressEdit={() => undefined}
                onPressRetry={() => undefined}
            />
        );

        expect(getByText('All Clear!')).toBeTruthy();
        expect(getByText('등록된 알레르기 정보가 없습니다.')).toBeTruthy();
        expect(getByText('Add allergy info')).toBeTruthy();
    });

    test('renders error state when loading fails', () => {
        const { getByText, queryByText } = render(
            <AllergyListSection
                loading={false}
                loadError={true}
                allergies={[]}
                dietaryRestrictions={[]}
                severityMap={{}}
                theme={theme}
                onPressEdit={() => undefined}
                onPressRetry={() => undefined}
            />
        );

        expect(getByText('Unable to load allergy info')).toBeTruthy();
        expect(getByText('We could not load your allergy information. Please try again.')).toBeTruthy();
        expect(getByText('Try again')).toBeTruthy();
        expect(queryByText('All Clear!')).toBeNull();
    });

    test('renders split sections and severity labels', () => {
        const { getAllByText, getByText } = render(
            <AllergyListSection
                loading={false}
                loadError={false}
                allergies={['Peanuts', 'Milk']}
                dietaryRestrictions={['Vegan']}
                severityMap={{ Peanuts: 'severe', Milk: 'mild' }}
                theme={theme}
                onPressEdit={() => undefined}
                onPressRetry={() => undefined}
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
    });
});
