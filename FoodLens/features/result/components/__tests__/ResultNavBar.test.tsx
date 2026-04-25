import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ResultNavBar from '../ResultNavBar';

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

        const reportButton = getByLabelText('Report');

        fireEvent.press(reportButton);

        expect(onBack).not.toHaveBeenCalled();
        expect(onReport).toHaveBeenCalledTimes(1);
        expect(reportButton.props.hitSlop).toEqual({
            top: 12,
            right: 12,
            bottom: 12,
            left: 12,
        });
        expect(queryByLabelText('Share')).toBeNull();
    });
});
