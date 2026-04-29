import React from 'react';
import { render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import { Colors } from '@/constants/theme';
import { homeDashboardDarkColors } from '@/features/home/components/homeDashboardTokens';
import AllergenGrid from '../AllergenGrid';

jest.mock('@/services/auth/currentUser', () => ({
  getCurrentUserIdSnapshot: () => 'test-user',
}));

const translate = (_key: string, fallback?: string): string => fallback || _key;

describe('AllergenGrid', () => {
  it('uses dark dashboard tokens for selected allergen states', () => {
    render(
      <AllergenGrid
        dashboardColors={homeDashboardDarkColors}
        theme={Colors.dark}
        selectedAllergies={['peanut']}
        onToggle={jest.fn()}
        t={translate}
      />
    );

    const selectedCard = screen.getByLabelText('Peanuts');
    const selectedLabel = screen.getByText('Peanuts');

    expect(StyleSheet.flatten(selectedCard.props.style)).toMatchObject({
      backgroundColor: homeDashboardDarkColors.accentGreenSoft,
      borderColor: homeDashboardDarkColors.accentGreen,
    });
    expect(StyleSheet.flatten(selectedLabel.props.style)).toMatchObject({
      color: homeDashboardDarkColors.accentGreen,
    });
  });
});
