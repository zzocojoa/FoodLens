import React from 'react';
import { StyleSheet } from 'react-native';
import { render } from '@testing-library/react-native';

import AllergiesConciergeRail from '../AllergiesConciergeRail';
import { homeDashboardDarkColors } from '@/features/home/components/homeDashboardTokens';

describe('AllergiesConciergeRail', () => {
    it('uses supplied dark colors for status tone tokens', () => {
        const view = render(
            <AllergiesConciergeRail
                colors={homeDashboardDarkColors}
                eyebrow="Allergy"
                title="Traveler card"
                description="Ready for travel."
                statusLabel="Ready"
                savedCountLabel="3 saved"
                statusTone="safe"
            />
        );

        const statusLabel = view.getByText('Ready');
        const statusPill = statusLabel.parent?.parent;

        expect(StyleSheet.flatten(statusLabel.props.style)).toMatchObject({
            color: homeDashboardDarkColors.accentGreen,
        });
        expect(statusPill).not.toBeNull();
        expect(StyleSheet.flatten(statusPill?.props.style)).toMatchObject({
            backgroundColor: homeDashboardDarkColors.accentGreenSoft,
            borderColor: homeDashboardDarkColors.accentGreen,
        });
    });
});
