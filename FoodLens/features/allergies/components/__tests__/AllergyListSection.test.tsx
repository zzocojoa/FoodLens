/// <reference types="jest" />

import React from 'react';
import { render } from '@testing-library/react-native';
import { ActivityIndicator } from 'react-native';
import AllergyListSection from '../AllergyListSection';
import { Colors } from '../../../../constants/theme';

describe('AllergyListSection', () => {
    const theme = Colors.light;

    test('renders loading indicator while loading', () => {
        const { UNSAFE_getByType } = render(
            <AllergyListSection loading={true} allergies={[]} theme={theme} />
        );

        expect(UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
    });

    test('renders empty state when allergies are not registered', () => {
        const { getByText } = render(
            <AllergyListSection loading={false} allergies={[]} theme={theme} />
        );

        expect(getByText('All Clear!')).toBeTruthy();
        expect(getByText('등록된 알레르기 정보가 없습니다.')).toBeTruthy();
    });

    test('renders translated and original labels for allergy items', () => {
        const { getByText } = render(
            <AllergyListSection loading={false} allergies={['Peanuts', 'Milk']} theme={theme} />
        );

        expect(getByText('땅콩')).toBeTruthy();
        expect(getByText('우유')).toBeTruthy();
        expect(getByText('Peanuts')).toBeTruthy();
        expect(getByText('Milk')).toBeTruthy();
    });
});
