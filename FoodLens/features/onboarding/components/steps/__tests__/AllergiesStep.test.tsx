import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Colors } from '@/constants/theme';
import AllergiesStep from '../AllergiesStep';
import type { Translate } from '../../../types/onboarding.types';

jest.mock('@/services/auth/currentUser', () => ({
  getCurrentUserIdSnapshot: () => 'test-user',
}));

const translate: Translate = (_key, fallback) => fallback ?? _key;

describe('AllergiesStep', () => {
  it('shows severity controls for selected allergens and updates the chosen level', () => {
    const onSetSeverity = jest.fn();
    const { getByLabelText, getByText } = render(
      <AllergiesStep
        theme={Colors.light}
        t={translate}
        selectedAllergies={['peanut']}
        severityMap={{ peanut: 'moderate' }}
        onToggleAllergen={() => undefined}
        onSetSeverity={onSetSeverity}
        customInputValue=""
        customSuggestions={[]}
        onCustomInputChange={() => undefined}
        onAddCustomAllergen={() => undefined}
        onSelectCustomAllergenSuggestion={() => undefined}
      />
    );

    expect(getByText('Set Severity Level')).toBeTruthy();

    fireEvent.press(getByLabelText('Peanut - Severe'));

    expect(onSetSeverity).toHaveBeenCalledWith('peanut', 'severe');
  });
});
