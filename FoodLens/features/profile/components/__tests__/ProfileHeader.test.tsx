import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';
import { Colors } from '@/constants/theme';
import ProfileHeader from '../ProfileHeader';

jest.mock('@/features/i18n', () => ({
    useI18n: () => ({
        t: (_key: string, fallback?: string) => fallback ?? _key,
    }),
}));

describe('ProfileHeader', () => {
    it('uses the provided dark theme for header text and save action contrast', () => {
        const { getByText } = render(
            <ProfileHeader
                theme={Colors.dark}
                onBack={jest.fn()}
                title="Support & Policies"
                onSave={jest.fn()}
                saving={false}
            />,
        );

        const titleStyle = StyleSheet.flatten(getByText('Support & Policies').props.style);
        const saveStyle = StyleSheet.flatten(getByText('Save').props.style);

        expect(titleStyle.color).toBe(Colors.dark.textPrimary);
        expect(saveStyle.color).toBe(Colors.dark.background);
    });
});
