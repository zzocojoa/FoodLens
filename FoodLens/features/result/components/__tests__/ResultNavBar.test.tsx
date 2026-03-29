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
    it('calls share and report actions from the navbar buttons', () => {
        const onBack = jest.fn();
        const onShare = jest.fn();
        const onReport = jest.fn();

        const { getByLabelText } = render(
            <ResultNavBar
                onBack={onBack}
                onShare={onShare}
                onReport={onReport}
                shareAccessibilityLabel="Share"
                reportAccessibilityLabel="Report"
            />
        );

        fireEvent.press(getByLabelText('Share'));
        fireEvent.press(getByLabelText('Report'));
        fireEvent.press(getByLabelText('Share'));

        expect(onBack).not.toHaveBeenCalled();
        expect(onShare).toHaveBeenCalledTimes(2);
        expect(onReport).toHaveBeenCalledTimes(1);
    });
});
