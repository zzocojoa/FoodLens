import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ResultNavBar from '../ResultNavBar';

jest.mock('@expo/vector-icons', () => {
    const mockReactModule = jest.requireActual('react');
    const mockNativeModule = jest.requireActual('react-native');
    return {
        Ionicons: ({ name }: { name: string }) =>
            mockReactModule.createElement(mockNativeModule.Text, null, `icon-${name}`),
    };
});

describe('ResultNavBar', () => {
    it('keeps only the report utility action in the navbar', () => {
        const onBack = jest.fn();
        const onReport = jest.fn();

        const { getByLabelText, queryByLabelText } = render(
            <ResultNavBar
                onBack={onBack}
                onReport={onReport}
                reportAccessibilityLabel="Report"
            />
        );

        fireEvent.press(getByLabelText('Report'));

        expect(onBack).not.toHaveBeenCalled();
        expect(onReport).toHaveBeenCalledTimes(1);
        expect(queryByLabelText('Share')).toBeNull();
    });
});
